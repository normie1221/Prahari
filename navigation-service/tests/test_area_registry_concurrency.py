"""
Regression test for the area-build race condition:
two concurrent requests that both need the SAME brand-new area must only
trigger ONE real build (one OSM download + one XGBoost train), not two.

Before the fix in area_registry.py, `get_or_build_area_for_points` checked
`_find_covering_area()` (found nothing, since the area is new), then called
`build_area()` directly with no locking — so two threads racing through that
check at the same time would both proceed to build, duplicating a very
expensive operation.
"""
import time
import threading
import networkx as nx

from app.services import area_registry


def _fake_download_area_graph(lat, lon, radius_m):
    # Simulate a slow OSM download so the race window is wide enough for
    # both threads to reliably enter the "no existing area" branch before
    # either finishes building.
    time.sleep(0.2)
    G = nx.MultiDiGraph()
    G.add_node(1, y=lat, x=lon)
    G.add_node(2, y=lat + 0.001, x=lon + 0.001)
    G.add_edge(1, 2, key=0, length=100.0, highway="residential")
    return G


def _fake_scored_graph(G):
    for u, v, k, data in G.edges(data=True, keys=True):
        data["safety_score"] = 6.0
        data["safety_cost"] = 5.0
    return G


def test_concurrent_requests_for_new_area_build_only_once(monkeypatch):
    build_calls = {"count": 0}

    def counting_download(lat, lon, radius_m):
        build_calls["count"] += 1
        return _fake_download_area_graph(lat, lon, radius_m)

    monkeypatch.setattr(area_registry.rf, "download_area_graph", counting_download)
    monkeypatch.setattr(area_registry, "build_safety_weighted_graph_with_features", _fake_scored_graph)

    # Same origin/destination for every thread -> same computed area_id.
    origin = (12.9357366, 77.6240810)
    destination = (12.9360000, 77.6245000)

    results = []
    errors = []

    def worker():
        try:
            G, meta = area_registry.get_or_build_area_for_points(*origin, *destination)
            results.append((G, meta))
        except Exception as exc:  # pragma: no cover - surfaced via assertion below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert not errors, f"worker threads raised: {errors}"
    assert len(results) == 6
    # The core assertion: only ONE real build happened, no matter how many
    # concurrent callers asked for the same new area at once.
    assert build_calls["count"] == 1

    # All callers should have received the same built graph/meta.
    first_meta = results[0][1]
    for _, meta in results[1:]:
        assert meta["builtAtEpoch"] == first_meta["builtAtEpoch"]


def test_different_areas_build_independently_and_in_parallel(monkeypatch):
    """Sanity check that the per-area lock doesn't accidentally serialize
    unrelated areas — two distinct areas should both build, and the total
    wall time should look parallel, not sequential."""
    monkeypatch.setattr(area_registry.rf, "download_area_graph", _fake_download_area_graph)
    monkeypatch.setattr(area_registry, "build_safety_weighted_graph_with_features", _fake_scored_graph)

    results = []

    def worker(origin, destination):
        results.append(area_registry.get_or_build_area_for_points(*origin, *destination))

    # Two clearly separated locations -> two distinct areas.
    t0 = time.time()
    t1 = threading.Thread(target=worker, args=((12.9357, 77.6240), (12.9360, 77.6245)))
    t2 = threading.Thread(target=worker, args=((13.0500, 77.5900), (13.0510, 77.5910)))
    t1.start(); t2.start()
    t1.join(timeout=5); t2.join(timeout=5)
    elapsed = time.time() - t0

    assert len(results) == 2
    # Each build sleeps 0.2s; if they ran serially that's >= 0.4s, in
    # parallel it should be close to 0.2s. Generous bound for CI jitter.
    assert elapsed < 0.35
