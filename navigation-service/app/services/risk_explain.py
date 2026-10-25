"""
Risk Explanation
=================
Builds a short list of human-readable factors for a computed route.
Every factor here is derived from real values the model actually used
(OSM `lit` tag coverage, road classification, distance to police / nightlife
POIs, the model's own safety_score). Nothing is invented, and every route
carries an explicit reminder that this is a model prediction over OSM-derived
proxies, not verified crime data (see PRAHARI "Responsible Safety AI"
requirement).
"""
from statistics import mean


SAFE_ROAD_TYPES = {"residential", "living_street", "pedestrian", "footway", "cycleway", "path"}
RISKY_ROAD_TYPES = {"unclassified", "track", "service", "tertiary_link", "secondary_link"}


def explain_route(edges: list) -> list:
    """`edges` is the list of (u, v, data) tuples produced by
    prahari_route_finder._path_stats — i.e. the actual segments of the
    computed path, with whatever attributes the graph edges carry."""
    if not edges:
        return []

    lit_vals = [d.get("feat_lit") for _, _, d in edges if d.get("feat_lit") is not None]
    police_dists = [d.get("feat_dist_police_m") for _, _, d in edges if isinstance(d.get("feat_dist_police_m"), (int, float))]
    nightlife_dists = [d.get("feat_dist_nightlife_m") for _, _, d in edges if isinstance(d.get("feat_dist_nightlife_m"), (int, float))]
    highways = [d.get("feat_highway") or d.get("highway") for _, _, d in edges]
    highways = [h[0] if isinstance(h, list) else h for h in highways]

    factors = []

    if lit_vals:
        lit_frac = sum(1 for v in lit_vals if str(v).lower() == "yes") / len(lit_vals)
        if lit_frac >= 0.6:
            factors.append(f"{round(lit_frac * 100)}% of tagged segments are marked as street-lit in OpenStreetMap")
        elif lit_frac <= 0.15 and lit_vals:
            factors.append("Very few segments on this path have street-lighting tags in OpenStreetMap")

    if police_dists:
        avg_p = mean(police_dists)
        if avg_p <= 400:
            factors.append(f"Passes within ~{round(avg_p)} m of a known police point on average")
        elif avg_p >= 1500:
            factors.append(f"No police point mapped within ~{round(avg_p)} m of this path on average")

    if nightlife_dists:
        avg_n = mean(nightlife_dists)
        if avg_n <= 200:
            factors.append(f"Runs close (~{round(avg_n)} m avg) to mapped nightlife venues (bars/pubs)")

    if highways:
        safe_frac = sum(1 for h in highways if h in SAFE_ROAD_TYPES) / len(highways)
        risky_frac = sum(1 for h in highways if h in RISKY_ROAD_TYPES) / len(highways)
        if safe_frac >= 0.5:
            factors.append("Primarily residential / pedestrian-classified streets")
        if risky_frac >= 0.3:
            factors.append("Includes stretches of unclassified, track, or service roads")

    if not factors:
        factors.append("Limited OSM tag coverage for this path — score is based mainly on road type and length")

    factors.append(
        "Risk score is a model prediction from map-derived proxies (lighting tags, road type, "
        "proximity to police/nightlife POIs) — not verified crime data."
    )
    return factors
