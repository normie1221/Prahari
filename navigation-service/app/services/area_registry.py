"""
Area Registry
==============
This is the ONLY layer that makes the existing PRAHARI model viable as a
live API. It does not change the model's intelligence at all — it only
decides WHEN to call it and WHERE to keep the result.

Why this exists
----------------
`prahari_route_finder.py` / `prahari_safety_pipeline.py`, as provided, are
built for one-off interactive runs: every invocation downloads a fresh OSM
street network + POI set for the area and trains a brand-new XGBoost model
on freshly-generated synthetic labels. That is correct behaviour for a
research script, but a live API cannot pay a multi-second-to-multi-minute
OSM-download + training cost on every single route request.

So we:
  1. Group the world into "areas" (a centre point + radius).
  2. The FIRST time a route request needs an area we don't have yet, we call
     the original, UNMODIFIED pipeline functions to build it exactly the way
     the script does today (download_area_graph -> build_safety_weighted_graph),
     then persist the resulting graph + trained pipeline to disk.
  3. Every subsequent request that falls inside an already-built area reuses
     the persisted, safety-scored graph — routing itself
     (networkx.shortest_path) is fast, so requests after the first one are
     fast too.
  4. Areas older than AREA_MAX_AGE_HOURS are flagged stale and can be
     rebuilt in the background (still calling the same unmodified functions).

Nothing here re-implements routing, safety scoring, or feature engineering —
it only calls into app.model.prahari_route_finder /
app.model.prahari_safety_pipeline, which are byte-identical to the files in
the original ZIP.
"""
import os
import sys
import json
import time
import pickle
import hashlib
import logging
import threading
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "model"))

from .. import config
from ..model import prahari_route_finder as rf  # unmodified
from .scoring_adapter import build_safety_weighted_graph_with_features

logger = logging.getLogger("prahari.area_registry")

_LOCK = threading.RLock()
_MEM_CACHE: dict = {}  # area_id -> {"G":..., "meta":...}  (hot, in-process)

# Per-area build locks: prevents the race where two concurrent requests for
# the SAME new (not-yet-warm) area both see "not found" and both kick off a
# full OSM-download + XGBoost-train job at once. `_locks_guard` only
# protects the (very fast) creation of a new per-area Lock object; the
# actual expensive build work happens outside `_locks_guard`, so unrelated
# areas still build fully in parallel.
_area_build_locks: dict = {}
_locks_guard = threading.Lock()


def _get_area_build_lock(area_id: str) -> threading.Lock:
    with _locks_guard:
        if area_id not in _area_build_locks:
            _area_build_locks[area_id] = threading.Lock()
        return _area_build_locks[area_id]


def _area_id(lat: float, lon: float, radius_m: int) -> str:
    key = f"{round(lat, 3)}:{round(lon, 3)}:{radius_m}"
    return hashlib.sha1(key.encode()).hexdigest()[:16]


def _haversine_m(lat1, lon1, lat2, lon2):
    from math import radians, sin, cos, asin, sqrt
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6_371_000.0 * asin(sqrt(a))


def _area_dir(area_id: str) -> str:
    return os.path.join(config.DATA_DIR, area_id)


def _persist(area_id: str, G, meta: dict) -> None:
    d = _area_dir(area_id)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "graph.pkl"), "wb") as f:
        pickle.dump(G, f, protocol=pickle.HIGHEST_PROTOCOL)
    with open(os.path.join(d, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)


def _load_from_disk(area_id: str):
    d = _area_dir(area_id)
    graph_path, meta_path = os.path.join(d, "graph.pkl"), os.path.join(d, "meta.json")
    if not (os.path.exists(graph_path) and os.path.exists(meta_path)):
        return None
    with open(meta_path) as f:
        meta = json.load(f)
    with open(graph_path, "rb") as f:
        G = pickle.load(f)
    return {"G": G, "meta": meta}


def list_areas() -> list:
    """List every area currently warmed (in-memory or on disk)."""
    seen = {}
    if os.path.isdir(config.DATA_DIR):
        for area_id in os.listdir(config.DATA_DIR):
            meta_path = os.path.join(_area_dir(area_id), "meta.json")
            if os.path.exists(meta_path):
                with open(meta_path) as f:
                    seen[area_id] = json.load(f)
    for area_id, entry in _MEM_CACHE.items():
        seen[area_id] = entry["meta"]
    return [{"areaId": k, **v} for k, v in seen.items()]


def _find_covering_area(lat: float, lon: float, radius_m: int):
    """Return an already-warm area (mem or disk) that covers this request,
    if one exists within AREA_REUSE_SLACK_M and not older than the max age."""
    now = time.time()
    max_age_s = config.AREA_MAX_AGE_HOURS * 3600
    candidates = list_areas()
    for c in candidates:
        dist = _haversine_m(lat, lon, c["centreLat"], c["centreLon"])
        covers = dist + radius_m <= c["radiusM"] + config.AREA_REUSE_SLACK_M
        fresh = (now - c["builtAtEpoch"]) <= max_age_s
        if covers and fresh:
            return c["areaId"]
    return None


def build_area(name: str, lat: float, lon: float, radius_m: int) -> dict:
    """Force-build (or rebuild) an area using the UNMODIFIED model pipeline.
    This is the expensive path: OSM download + POI download + XGBoost train.
    """
    area_id = _area_id(lat, lon, radius_m)
    logger.info("Building area '%s' (%s) centre=(%.5f,%.5f) radius=%dm",
                name, area_id, lat, lon, radius_m)
    t0 = time.time()

    # download_area_graph is the exact, unmodified model function.
    # build_safety_weighted_graph_with_features runs the identical scoring
    # pipeline (see scoring_adapter.py docstring) and additionally retains
    # real per-edge features for explainability.
    G = rf.download_area_graph(lat, lon, radius_m)
    G = build_safety_weighted_graph_with_features(G)

    meta = {
        "name": name,
        "centreLat": lat,
        "centreLon": lon,
        "radiusM": radius_m,
        "nodeCount": G.number_of_nodes(),
        "edgeCount": G.number_of_edges(),
        "builtAtEpoch": time.time(),
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "buildSeconds": round(time.time() - t0, 1),
    }

    with _LOCK:
        _persist(area_id, G, meta)
        _MEM_CACHE[area_id] = {"G": G, "meta": meta}

    logger.info("Area '%s' built in %.1fs (%d nodes, %d edges)",
                name, meta["buildSeconds"], meta["nodeCount"], meta["edgeCount"])
    return meta


def get_or_build_area_for_points(slat, slon, dlat, dlon, name_hint: str = "auto"):
    """Main entry point used by route_service: find (or build) an area graph
    that covers both the origin and destination points.

    Concurrency: if two requests need the same brand-new area at the same
    time, only one of them actually builds it — the other blocks on that
    area's build lock and then reuses the result, instead of triggering a
    second, wholly redundant OSM-download + XGBoost-train job.

    Known limitation: two requests whose origin/destination pairs are
    similar but not identical can still compute slightly different bounding
    boxes (and therefore different area_ids) before either area exists yet,
    so this does not fully dedupe "morally the same" concurrent cold-starts
    across a whole city — only exact repeats. A production hardening step
    would snap new areas to a fixed geographic grid before computing
    area_id, so any two requests landing in the same grid cell always
    contend for the same lock. Left as a follow-up since it changes area
    sizing/reuse behaviour and deserves its own testing pass.
    """
    clat, clon, radius_m = rf.compute_bounding_box(
        slat, slon, dlat, dlon, padding=config.BBOX_PADDING
    )
    radius_m = max(radius_m, config.MIN_RADIUS_M)

    existing = _find_covering_area(clat, clon, radius_m)
    if existing:
        with _LOCK:
            if existing in _MEM_CACHE:
                return _MEM_CACHE[existing]["G"], _MEM_CACHE[existing]["meta"]
            loaded = _load_from_disk(existing)
            if loaded:
                _MEM_CACHE[existing] = loaded
                return loaded["G"], loaded["meta"]

    # No existing area covers this request yet — serialize the build on this
    # specific target area_id so concurrent callers for the same area don't
    # duplicate work. Callers targeting a *different* area_id use a
    # different lock and proceed independently.
    area_id = _area_id(clat, clon, radius_m)
    build_lock = _get_area_build_lock(area_id)

    with build_lock:
        # Re-check after acquiring the lock: another thread may have just
        # finished building this exact area while we were waiting.
        with _LOCK:
            if area_id in _MEM_CACHE:
                return _MEM_CACHE[area_id]["G"], _MEM_CACHE[area_id]["meta"]
        loaded = _load_from_disk(area_id)
        if loaded:
            with _LOCK:
                _MEM_CACHE[area_id] = loaded
            return loaded["G"], loaded["meta"]

        meta = build_area(name_hint, clat, clon, radius_m)
        return _MEM_CACHE[area_id]["G"], meta


def warm_startup_areas():
    """Called once at service startup to pre-build the configured default
    areas in the background, so the first real user isn't the one who waits."""
    def _run():
        for entry in config.DEFAULT_WARM_AREAS.split(";"):
            entry = entry.strip()
            if not entry:
                continue
            try:
                name, lat, lon, radius = entry.split(":")
                found = _find_covering(float(lat), float(lon), int(radius))
                if found and found[1]:
                    logger.info("Area '%s' already built and fresh - skipping startup rebuild", name)
                    continue
                with _GLOBAL_BUILD_SEM:
                    build_area(name, float(lat), float(lon), int(radius))
            except Exception:
                logger.exception("Failed warming area '%s'", entry)

    threading.Thread(target=_run, daemon=True).start()


# ---------------------------------------------------------------------------
# Non-blocking area access (used by live route requests)
# ---------------------------------------------------------------------------
# Building a large area (OSM download + XGBoost training) can take minutes.
# A user's HTTP request must never sit waiting on that, so live requests use
# get_area_for_points_nonblocking():
#   - a fresh covering area           -> returned immediately
#   - an older-than-max-age area      -> returned immediately AND refreshed in
#                                        the background (stale-while-revalidate)
#   - no covering area yet            -> a background build is started and the
#                                        caller is told {"status": "building"}
#                                        so the client can poll
#   - the last background build failed -> {"status": "failed"} once, then the
#                                        next request retries the build
# Background builds are serialized by _GLOBAL_BUILD_SEM so two huge builds can
# never run at the same time and exhaust memory.

_GLOBAL_BUILD_SEM = threading.Semaphore(1)
_building: dict = {}      # area_id -> {"startedAt": epoch, "radiusM": int, "name": str}
_build_errors: dict = {}  # area_id -> {"error": str, "at": epoch}


def _find_covering(lat: float, lon: float, radius_m: int):
    """Like _find_covering_area, but also returns areas older than the max
    age. Returns (meta, is_fresh) for the best match (fresh preferred), or None."""
    now = time.time()
    max_age_s = config.AREA_MAX_AGE_HOURS * 3600
    best = None
    for c in list_areas():
        dist = _haversine_m(lat, lon, c["centreLat"], c["centreLon"])
        if dist + radius_m <= c["radiusM"] + config.AREA_REUSE_SLACK_M:
            fresh = (now - c["builtAtEpoch"]) <= max_age_s
            if fresh:
                return c, True
            if best is None or c["builtAtEpoch"] > best["builtAtEpoch"]:
                best = c
    return (best, False) if best else None


def _load_entry(area_id: str):
    with _LOCK:
        if area_id in _MEM_CACHE:
            return _MEM_CACHE[area_id]
    loaded = _load_from_disk(area_id)
    if loaded:
        with _LOCK:
            _MEM_CACHE[area_id] = loaded
    return loaded


def _start_background_build(area_id: str, name: str, lat: float, lon: float, radius_m: int) -> bool:
    """Start building an area in a background thread. Returns False if a build
    for this area is already running (so callers can poll safely)."""
    with _LOCK:
        if area_id in _building:
            return False
        _building[area_id] = {"startedAt": time.time(), "radiusM": radius_m, "name": name}
        _build_errors.pop(area_id, None)

    def _run():
        try:
            with _GLOBAL_BUILD_SEM, _get_area_build_lock(area_id):
                build_area(name, lat, lon, radius_m)
        except Exception as exc:  # recorded and surfaced to the next request
            logger.exception("Background build failed for area %s", area_id)
            with _LOCK:
                _build_errors[area_id] = {"error": str(exc)[:300], "at": time.time()}
        finally:
            with _LOCK:
                _building.pop(area_id, None)

    threading.Thread(target=_run, daemon=True, name=f"build-{area_id}").start()
    return True


def get_area_for_points_nonblocking(slat, slon, dlat, dlon, name_hint: str = "auto") -> dict:
    clat, clon, radius_m = rf.compute_bounding_box(slat, slon, dlat, dlon, padding=config.BBOX_PADDING)
    radius_m = max(radius_m, config.MIN_RADIUS_M)

    found = _find_covering(clat, clon, radius_m)
    if found:
        meta, fresh = found
        entry = _load_entry(meta["areaId"])
        if entry:
            if not fresh:
                _start_background_build(meta["areaId"], meta["name"], meta["centreLat"], meta["centreLon"], meta["radiusM"])
            return {"status": "ready", "G": entry["G"], "meta": entry["meta"], "stale": not fresh}

    area_id = _area_id(clat, clon, radius_m)
    with _LOCK:
        building = _building.get(area_id)
        err = _build_errors.get(area_id)
        if err and not building:
            _build_errors.pop(area_id, None)  # surface once; the next request retries
    if err and not building:
        return {"status": "failed", "areaId": area_id, "error": err["error"]}

    _start_background_build(area_id, name_hint, clat, clon, radius_m)
    with _LOCK:
        info = _building.get(area_id)
        queued_behind = max(0, len(_building) - 1)
    started = info["startedAt"] if info else time.time()
    return {
        "status": "building",
        "areaId": area_id,
        "radiusM": radius_m,
        "elapsedSeconds": round(time.time() - started),
        "queuedBehind": queued_behind,
    }
