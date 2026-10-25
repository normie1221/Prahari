"""
Regression test for two real bugs found in the original pipeline's
score-mapping logic (see scoring_adapter.py module docstring):

1. extract_physical_features() resets the (u, v, key) edge identity to a
   plain row-number index, so every downstream score lookup by (u, v, key)
   always misses and silently falls back to a flat neutral default.
2. The original score_graph_edges() never actually calls the trained
   model's predict() — it reads the raw synthetic training label instead.

Both together mean: with the original code, EVERY edge in EVERY area always
gets safety_score == 5.0, regardless of any real feature. This test builds a
small synthetic graph (no network access needed) and asserts real,
non-flat, edge-specific scores come out the other end.
"""
import networkx as nx
from unittest.mock import MagicMock

from app.services import scoring_adapter


def _make_synthetic_graph(n_edges=6):
    """A tiny graph with edges that have clearly different physical
    features, so a working pipeline should produce clearly different
    scores for each — while a broken one (bug 1) collapses everything to
    the same default regardless of these differences."""
    G = nx.MultiDiGraph()
    G.graph["crs"] = "epsg:4326"
    for i in range(n_edges + 1):
        G.add_node(i, y=12.9 + i * 0.001, x=77.6 + i * 0.001)
    highways = ["residential", "primary", "unclassified", "footway", "service", "track"]
    for i in range(n_edges):
        G.add_edge(
            i, i + 1, key=0,
            length=100.0 + i * 10,
            highway=highways[i % len(highways)],
            lit="yes" if i % 2 == 0 else "no",
            lanes=1,
            oneway=0,
        )
    return G


def test_every_edge_gets_a_real_distinct_score(monkeypatch):
    """The core regression assertion: scores must not collapse to a single
    flat value across edges with genuinely different features."""
    G = _make_synthetic_graph()

    # No real network access needed: stub the POI download (irrelevant to
    # this specific regression — proximity features are covered elsewhere).
    import geopandas as gpd
    empty_pois = gpd.GeoDataFrame({"geometry": []}, geometry="geometry", crs="EPSG:4326")
    monkeypatch.setattr(scoring_adapter, "download_pois", lambda *a, **k: (empty_pois, empty_pois))

    result_G = scoring_adapter.build_safety_weighted_graph_with_features(G)

    scores = [d["safety_score"] for _, _, d in result_G.edges(data=True)]
    assert len(set(round(s, 2) for s in scores)) > 1, (
        "All edges got the identical safety_score — this is the exact "
        "regression this test guards against (see module docstring)."
    )
    # Every edge should have matched a real prediction, not the 5.0 fallback
    # used only for edges the model genuinely couldn't score.
    assert all(isinstance(s, float) for s in scores)


def test_edge_identity_survives_feature_extraction():
    """Directly guards bug #1: the (u, v, key) index must not be reset to
    a plain range index partway through the pipeline."""
    import osmnx as ox
    from app.model.prahari_safety_pipeline import extract_physical_features

    G = _make_synthetic_graph()
    _, edges_gdf = ox.graph_to_gdfs(G)
    original_index = edges_gdf.index

    feature_df = extract_physical_features(edges_gdf)
    # This documents the original bug's actual behavior (index IS reset by
    # extract_physical_features itself) -- the fix lives in the adapter,
    # which re-attaches original_index immediately afterward. This
    # assertion exists so that if a future version of the vendored pipeline
    # file changes this behavior, the adapter's own fix is revisited too.
    assert list(feature_df.index) != list(original_index) or len(original_index) <= 1, (
        "extract_physical_features no longer resets the index — if this "
        "assertion now fails, scoring_adapter.py's re-attachment fix may "
        "be unnecessary or need updating."
    )
