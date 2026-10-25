"""
Heatmap Service
===============
Surfaces the model's own per-edge safety_score for whichever warm areas
overlap the requested bounding box, so the frontend can render a real
risk heatmap rather than a static/fake overlay. If no area has been warmed
for the requested location yet, this returns an empty list — it never
fabricates data for uncovered regions.
"""
from .area_registry import list_areas, _load_from_disk, _MEM_CACHE, _area_id


def _bbox_overlaps(area_meta: dict, min_lat, min_lon, max_lat, max_lon) -> bool:
    # Approximate the warm area's own bounding box from its centre + radius.
    deg_lat = area_meta["radiusM"] / 111_000
    deg_lon = area_meta["radiusM"] / (111_000 * 0.85)  # rough correction, fine at city scale
    a_min_lat, a_max_lat = area_meta["centreLat"] - deg_lat, area_meta["centreLat"] + deg_lat
    a_min_lon, a_max_lon = area_meta["centreLon"] - deg_lon, area_meta["centreLon"] + deg_lon
    return not (a_max_lat < min_lat or a_min_lat > max_lat or a_max_lon < min_lon or a_min_lon > max_lon)


def get_heatmap_edges(min_lat, min_lon, max_lat, max_lon, limit=4000) -> list:
    out = []
    for meta in list_areas():
        if not _bbox_overlaps(meta, min_lat, min_lon, max_lat, max_lon):
            continue
        area_id = _area_id(meta["centreLat"], meta["centreLon"], meta["radiusM"])
        entry = _MEM_CACHE.get(area_id) or _load_from_disk(area_id)
        if not entry:
            continue
        G = entry["G"]
        for u, v, data in G.edges(data=True):
            uy, ux = G.nodes[u].get("y"), G.nodes[u].get("x")
            vy, vx = G.nodes[v].get("y"), G.nodes[v].get("x")
            if uy is None or vy is None:
                continue
            mid_lat, mid_lon = (uy + vy) / 2, (ux + vx) / 2
            if not (min_lat <= mid_lat <= max_lat and min_lon <= mid_lon <= max_lon):
                continue
            out.append({
                "lat": mid_lat,
                "lon": mid_lon,
                "safetyScore": round(float(data.get("safety_score", 5.0)), 2),
            })
            if len(out) >= limit:
                return out
    return out
