from app.services.risk_explain import explain_route


def _edge(lit=None, dist_police_m=None, dist_nightlife_m=None, highway=None):
    data = {}
    if lit is not None:
        data["feat_lit"] = lit
    if dist_police_m is not None:
        data["feat_dist_police_m"] = dist_police_m
    if dist_nightlife_m is not None:
        data["feat_dist_nightlife_m"] = dist_nightlife_m
    if highway is not None:
        data["feat_highway"] = highway
    return (1, 2, data)


def test_explain_route_empty_edges_returns_empty_list():
    assert explain_route([]) == []


def test_explain_route_always_includes_disclaimer():
    edges = [_edge(lit="yes", highway="residential")]
    factors = explain_route(edges)
    assert any("model prediction" in f.lower() for f in factors)


def test_explain_route_flags_well_lit_path():
    edges = [_edge(lit="yes") for _ in range(8)] + [_edge(lit="no") for _ in range(2)]
    factors = explain_route(edges)
    assert any("lit" in f.lower() and "%" in f for f in factors)


def test_explain_route_flags_poorly_lit_path():
    edges = [_edge(lit="no") for _ in range(9)] + [_edge(lit="yes")]
    factors = explain_route(edges)
    assert any("few segments" in f.lower() for f in factors)


def test_explain_route_flags_nearby_police():
    edges = [_edge(dist_police_m=150.0), _edge(dist_police_m=200.0)]
    factors = explain_route(edges)
    assert any("police" in f.lower() for f in factors)


def test_explain_route_flags_far_from_police():
    edges = [_edge(dist_police_m=3000.0), _edge(dist_police_m=2500.0)]
    factors = explain_route(edges)
    assert any("no police point mapped" in f.lower() for f in factors)


def test_explain_route_flags_nightlife_proximity():
    edges = [_edge(dist_nightlife_m=80.0), _edge(dist_nightlife_m=120.0)]
    factors = explain_route(edges)
    assert any("nightlife" in f.lower() for f in factors)


def test_explain_route_flags_residential_roads():
    edges = [_edge(highway="residential") for _ in range(6)] + [_edge(highway="tertiary")]
    factors = explain_route(edges)
    assert any("residential" in f.lower() for f in factors)


def test_explain_route_flags_risky_road_types():
    edges = [_edge(highway="track") for _ in range(4)] + [_edge(highway="residential") for _ in range(6)]
    factors = explain_route(edges)
    assert any("unclassified" in f.lower() or "track" in f.lower() for f in factors)


def test_explain_route_never_fabricates_missing_data():
    # No feature data at all on any edge -> must not invent specific claims,
    # only the generic low-coverage note + disclaimer.
    edges = [(1, 2, {}), (2, 3, {})]
    factors = explain_route(edges)
    assert any("limited osm tag coverage" in f.lower() for f in factors)
    assert len(factors) == 2  # low-coverage note + disclaimer only
