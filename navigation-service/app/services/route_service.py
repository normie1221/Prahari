"""
Route Service
=============
The only place API request/response shapes are decided. All routing
intelligence (three shortest-path variants, safety-cost weighting) comes
straight from the unmodified `find_routes` / `_path_stats` in
prahari_route_finder.py.
"""
from .. import config
from ..model import prahari_route_finder as rf  # unmodified
from .area_registry import get_area_for_points_nonblocking, _haversine_m
from .risk_explain import explain_route

SPEED_KMH = {"walking": config.WALKING_SPEED_KMH, "driving": config.DRIVING_SPEED_KMH}

ROUTE_LABELS = {
    "safest": {"id": "SAFEST", "label": "Safest"},
    "shortest": {"id": "FASTEST", "label": "Fastest"},
    "balanced": {"id": "BALANCED", "label": "Best (Balanced)"},
}


def _risk_category(risk_score: int) -> str:
    if risk_score <= 33:
        return "LOWER_RISK"
    if risk_score <= 66:
        return "MODERATE_RISK"
    return "HIGHER_RISK"


def _edge_geometry(G, u, v, data) -> list:
    """Return [[lat, lon], ...] for one edge — same coordinate logic used
    by the model's own build_map() function."""
    geom = data.get("geometry")
    if geom is not None:
        return [[y, x] for x, y in geom.coords]
    return [
        [G.nodes[u]["y"], G.nodes[u]["x"]],
        [G.nodes[v]["y"], G.nodes[v]["x"]],
    ]


def _dedup_road_names(names: list) -> list:
    seen, out = set(), []
    for n in names:
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def _transform(key: str, stats: dict, G, mode: str) -> dict:
    speed_kmh = SPEED_KMH.get(mode, config.WALKING_SPEED_KMH)
    distance_km = round(stats["total_dist_m"] / 1000, 3)
    duration_min = round((distance_km / speed_kmh) * 60) if speed_kmh > 0 else None

    # avg_safety is 1-10 (higher = safer, per the model). Convert to a
    # 0-100 risk score where higher = riskier, matching the API contract.
    avg_safety = stats["avg_safety"]
    risk_score = round((10 - avg_safety) / 9 * 100)
    risk_score = max(0, min(100, risk_score))

    geometry = []
    segment_scores = []  # real per-segment safety_score (1-10), one per edge in the path
    segments = []  # per-edge geometry + score, so the map can color-code each road segment individually
    for (u, v, data), raw_score in zip(stats["edges"], stats["scores"]):
        pts = _edge_geometry(G, u, v, data)
        geometry.extend(pts)
        rounded_score = round(float(raw_score), 2)
        segment_scores.append(rounded_score)
        segments.append({"geometry": pts, "safetyScore": rounded_score})

    meta = ROUTE_LABELS[key]
    return {
        "id": f"route-{key}",
        "type": meta["id"],
        "label": meta["label"],
        "distanceKm": distance_km,
        "durationMin": duration_min,
        "riskScore": risk_score,
        "riskCategory": _risk_category(risk_score),
        "avgSafetyScore": round(avg_safety, 2),
        "minSafetyScore": round(stats["min_safety"], 2),
        "geometry": geometry,
        "segments": segments,  # [{geometry: [[lat,lon],...], safetyScore: 1-10}, ...] — for per-segment map coloring
        "segmentSafetyScores": segment_scores,  # 1-10 each, aligned to road_names order
        "roadNames": _dedup_road_names(stats["road_names"]),
        "riskFactors": explain_route(stats["edges"]),
        "segmentCount": len(stats["edges"]),
    }


class AreaNotReady(Exception):
    """The safety map for this area is still being built (or the build failed)."""
    def __init__(self, info: dict):
        super().__init__(info.get("status"))
        self.info = info


class RouteTooLong(Exception):
    def __init__(self, km: float):
        super().__init__(f"{km:.1f} km")
        self.km = km


def compute_routes(origin: dict, destination: dict, mode: str = "walking") -> dict:
    """origin/destination: {"lat": float, "lon": float}.
    Raises AreaNotReady while the area's safety map is still being prepared,
    and RouteTooLong for trips beyond config.MAX_ROUTE_KM."""
    slat, slon = origin["lat"], origin["lon"]
    dlat, dlon = destination["lat"], destination["lon"]

    straight_km = _haversine_m(slat, slon, dlat, dlon) / 1000
    if straight_km > config.MAX_ROUTE_KM:
        raise RouteTooLong(straight_km)

    area = get_area_for_points_nonblocking(slat, slon, dlat, dlon)
    if area["status"] != "ready":
        raise AreaNotReady(area)
    G, area_meta = area["G"], area["meta"]

    o_node = rf.snap_to_graph(G, slat, slon, "origin")
    d_node = rf.snap_to_graph(G, dlat, dlon, "destination")

    raw_routes = rf.find_routes(G, o_node, d_node)  # unmodified core routing

    routes = []
    for key in ("safest", "shortest", "balanced"):
        stats = raw_routes.get(key)
        if stats is not None:
            routes.append(_transform(key, stats, G, mode))

    return {
        "routes": routes,
        "area": {
            "name": area_meta["name"],
            "builtAt": area_meta["builtAt"],
            "nodeCount": area_meta["nodeCount"],
            "edgeCount": area_meta["edgeCount"],
            "refreshing": area.get("stale", False),
        },
    }
