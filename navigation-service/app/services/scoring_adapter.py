"""
Scoring Adapter
===============
`prahari_route_finder.build_safety_weighted_graph()` calls the pipeline
functions in `prahari_safety_pipeline.py` and returns a graph with
`safety_score` / `safety_cost` attached to every edge — but it discards the
intermediate feature table (lighting, road type, distance to police /
nightlife) once scoring is done.

For the app to honestly explain *why* a route has the risk score it has
(required: "only show factors that actually exist in the model/data — do not
invent explanations"), we need those per-edge features to still be there.

TWO BUGS FOUND DURING INTEGRATION (documented, not silently patched):

1. `extract_physical_features()` ends with
   `result = df[available].reset_index(drop=True)`, which discards the
   (u, v, key) MultiIndex that identifies which graph edge each row
   corresponds to, replacing it with plain 0..n-1 row numbers. Every
   downstream step (including the original `score_graph_edges`) tries to
   look up scores by `(u, v, key)` — since that identity is gone, the
   lookup always misses and silently falls back to the hardcoded default
   of 5.0 for every edge. This is NOT specific to any one area, road type,
   or OSM data quality issue — it reproduces with the original, completely
   unmodified pipeline functions, in any area. This module fixes it by
   capturing the true edge identity before calling
   `extract_physical_features` and re-attaching it positionally afterward
   (the function preserves row order, only the index labels are lost).

2. `score_graph_edges(G, scored_gdf, ml_pipe)` accepts the trained `ml_pipe`
   but never actually calls it — it reads `Safety_Score` straight off
   `scored_gdf`, which is the *synthetic heuristic label with injected
   noise* computed by `generate_target_variable`, before any training
   happens. The trained model's predictions were computed and then
   discarded. This module calls `ml_pipe.predict()` on the real feature
   matrix and uses those values instead, which is what the function's own
   docstring says it should do.

Neither fix changes the pipeline's feature engineering, target generation,
or training process — both are corrections to how already-computed values
get mapped back onto the graph, made entirely in this adapter file so
`prahari_safety_pipeline.py` and `prahari_route_finder.py` remain
byte-identical to the original ZIP.
"""
import math
import numpy as np
import geopandas as gpd
import osmnx as ox

from ..model.prahari_safety_pipeline import (
    download_pois,
    extract_physical_features,
    engineer_spatial_features,
    generate_target_variable,
    build_training_dataset,
    train_xgboost_pipeline,
)


def build_safety_weighted_graph_with_features(G):
    """Same feature engineering + training as the original pipeline, with
    edge identity preserved (bug 1) and the trained model's own predictions
    actually used for scoring (bug 2) — see module docstring."""
    _, edges_gdf = ox.graph_to_gdfs(G)
    original_index = edges_gdf.index  # the real (u, v, key) MultiIndex

    lats = [d["y"] for _, d in G.nodes(data=True)]
    lons = [d["x"] for _, d in G.nodes(data=True)]
    clat = (min(lats) + max(lats)) / 2
    clon = (min(lons) + max(lons)) / 2
    rm = max(int(max(
        (max(lats) - min(lats)) * 111_000,
        (max(lons) - min(lons)) * 111_000 * math.cos(math.radians(clat))
    ) / 2 * 1.2), 800)

    police_gdf, nightlife_gdf = download_pois(clat, clon, rm)

    feature_df = extract_physical_features(edges_gdf)
    # BUG FIX 1: restore the true edge identity that reset_index(drop=True)
    # discarded. Row order is preserved by extract_physical_features, so a
    # positional re-attachment is safe here.
    feature_df.index = original_index

    feature_df = engineer_spatial_features(feature_df, police_gdf, nightlife_gdf)
    model_df = generate_target_variable(feature_df)
    train_df = model_df.drop(columns=["geometry"], errors="ignore")
    X, y = build_training_dataset(train_df)
    ml_pipe, *_ = train_xgboost_pipeline(X, y)

    # BUG FIX 2: use the trained model's own predictions, not the raw
    # heuristic label with noise that the original score_graph_edges reads.
    predicted = ml_pipe.predict(X)
    predicted = np.clip(predicted, 1.0, 10.0)

    scored_gdf = gpd.GeoDataFrame(
        model_df, geometry=feature_df["geometry"].values, crs="EPSG:4326"
    )
    scored_gdf.loc[X.index, "Safety_Score"] = predicted

    score_lookup = {}
    for idx, row in scored_gdf.iterrows():
        if isinstance(idx, tuple) and len(idx) == 3:
            score_lookup[idx] = float(row.get("Safety_Score", 5.0))

    matched = 0
    for u, v, k, data in G.edges(data=True, keys=True):
        score = score_lookup.get((u, v, k))
        if score is None:
            score = 5.0
        else:
            matched += 1
        data["safety_score"] = score
        data["safety_cost"] = 11.0 - score

    total_edges = G.number_of_edges()
    print(f"  [OK] Model-predicted safety scores attached to {total_edges:,} edges "
          f"({matched:,} matched real predictions, {total_edges - matched:,} used neutral default) "
          f"— predicted range: {predicted.min():.2f}-{predicted.max():.2f}, std: {predicted.std():.2f}")

    # -- retain real feature values for explainability (unchanged from before) --
    feature_cols = ["highway", "lit", "lanes", "dist_police_m", "dist_nightlife_m"]
    lookup = {}
    for idx, row in scored_gdf.iterrows():
        if isinstance(idx, tuple) and len(idx) == 3:
            u, v, k = idx
            lookup[(u, v, k)] = {c: row.get(c) for c in feature_cols if c in row}

    for u, v, k, data in G.edges(data=True, keys=True):
        feats = lookup.get((u, v, k))
        if feats:
            for c, val in feats.items():
                if val is not None and not (isinstance(val, float) and math.isnan(val)):
                    data[f"feat_{c}"] = val

    return G
