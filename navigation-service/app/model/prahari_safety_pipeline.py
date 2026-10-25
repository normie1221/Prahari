"""
================================================================================
  PROJECT PRAHARI -- Advanced Predictive Safety Platform
  Proof-of-Concept ML Pipeline: Urban Street Safety Score Prediction
================================================================================

Pipeline Steps:
  1. OSM Graph & POI Extraction
  2. Spatial Feature Engineering
  3. Synthetic Safety Score Generation
  4. XGBoost Model Training
  5. Evaluation & Output

Dependencies:
  pip install osmnx geopandas pandas scikit-learn xgboost shapely numpy
================================================================================
"""

import sys
import io

# Force UTF-8 output on Windows terminals (avoids cp1252 UnicodeEncodeError).
# This is a no-op on Linux/macOS where stdout is already UTF-8.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import geopandas as gpd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import r2_score, mean_squared_error
from xgboost import XGBRegressor

try:
    import osmnx as ox
except ImportError:
    raise ImportError("osmnx is required. Install it with: pip install osmnx")

# -- Global Configuration -----------------------------------------------------
# Nominatim only stores Koramangala as a point, not a polygon boundary, so we
# use graph_from_point() with explicit coordinates + a radius instead of
# graph_from_place() which requires a polygon.
PLACE_NAME  = "Koramangala, Bengaluru, India"  # human-readable label only
CENTRE_LAT  = 12.9352   # Koramangala centroid (latitude)
CENTRE_LON  = 77.6245   # Koramangala centroid (longitude)
RADIUS_M    = 1500      # search radius in metres (~1.5 km covers the locality)
RANDOM_SEED = 42
TEST_SIZE   = 0.20
np.random.seed(RANDOM_SEED)


# =============================================================================
# STEP 1 -- OSM Graph & POI Extraction
# =============================================================================

def download_street_network(lat: float, lon: float, radius_m: int) -> tuple:
    """
    Download the drivable + walkable street network from OpenStreetMap
    using a point + radius query (more reliable than place-name queries
    for Indian neighbourhood names that Nominatim stores as points, not
    polygons).

    Args:
        lat      : Latitude of the area centroid
        lon      : Longitude of the area centroid
        radius_m : Search radius in metres

    Returns:
        nodes_gdf : GeoDataFrame of graph nodes (intersections / endpoints)
        edges_gdf : GeoDataFrame of graph edges (street segments)
    """
    print(
        f"\n[STEP 1] Downloading street network "
        f"(centre: {lat}, {lon} | radius: {radius_m} m) ..."
    )
    try:
        G = ox.graph_from_point(
            (lat, lon),
            dist=radius_m,
            network_type="all",
            retain_all=False,
        )
        nodes_gdf, edges_gdf = ox.graph_to_gdfs(G)
        print(
            f"  [OK] Network downloaded -> "
            f"{len(nodes_gdf):,} nodes | {len(edges_gdf):,} edges"
        )
        return nodes_gdf, edges_gdf
    except Exception as exc:
        raise RuntimeError(f"Failed to download street network: {exc}") from exc


def download_pois(lat: float, lon: float, radius_m: int) -> tuple:
    """
    Download two categories of Points of Interest (POIs) from OSM using a
    point + radius query (consistent with how we fetched the street network).

      - police  : proxies for safety infrastructure presence
      - pub/bar : proxies for nightlife / potential risk zones

    Returns:
        police_gdf    : GeoDataFrame of police-station POIs
        nightlife_gdf : GeoDataFrame of pub/bar POIs
    """
    print("\n[STEP 1b] Downloading POIs (police stations & nightlife) ...")

    def _fetch_poi(tags: dict, label: str) -> gpd.GeoDataFrame:
        try:
            gdf = ox.features_from_point(
                (lat, lon),
                tags=tags,
                dist=radius_m,
            )
            # Retain only point geometry; discard building footprints / polygons
            gdf = gdf[gdf.geometry.geom_type == "Point"].copy()
            print(f"  [OK] {label:18s} -> {len(gdf):,} POIs found")
            return gdf[["geometry"]].reset_index(drop=True)
        except Exception as exc:
            print(f"  [WARN] {label:18s} -> 0 POIs (fetch failed: {exc})")
            # Return an empty GeoDataFrame so downstream code still works
            return gpd.GeoDataFrame(
                columns=["geometry"], geometry="geometry", crs="EPSG:4326"
            )

    police_gdf    = _fetch_poi({"amenity": "police"},       "Police Stations")
    nightlife_gdf = _fetch_poi({"amenity": ["pub", "bar"]}, "Pubs / Bars")

    return police_gdf, nightlife_gdf


# =============================================================================
# STEP 2 -- Spatial Feature Engineering
# =============================================================================

def extract_physical_features(edges_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Pull physical / OSM-tagged attributes from the street edges.

    Features extracted:
      highway : Road classification (primary, residential, footway, ...)
      lit     : Whether the street has street lighting ('yes' / 'no' / 'unknown')
      lanes   : Number of carriageway lanes (numeric)
      length  : Edge length in metres (computed by osmnx)
      oneway  : Boolean flag for one-way streets (encoded as 0/1)
    """
    print("\n[STEP 2] Extracting physical features from edge attributes ...")

    df = edges_gdf.copy()

    # -- highway ---------------------------------------------------------------
    # OSM sometimes stores multiple types as a list; take the first element.
    def _normalise_highway(val):
        if isinstance(val, list):
            return val[0]
        if pd.isna(val):
            return "unknown"
        return str(val)

    df["highway"] = df["highway"].apply(_normalise_highway)

    # -- lit -------------------------------------------------------------------
    # Map OSM free-text to tidy categories; treat missing as 'unknown'
    lit_map = {"yes": "yes", "no": "no", "True": "yes", "False": "no"}
    if "lit" in df.columns:
        df["lit"] = (
            df["lit"]
            .astype(str)
            .str.strip()
            .map(lit_map)
            .fillna("unknown")
        )
    else:
        df["lit"] = "unknown"

    # -- lanes -----------------------------------------------------------------
    def _parse_lanes(val):
        if isinstance(val, list):
            val = val[0]
        try:
            return float(val)
        except (TypeError, ValueError):
            return np.nan

    if "lanes" in df.columns:
        df["lanes"] = df["lanes"].apply(_parse_lanes)
    else:
        df["lanes"] = np.nan

    # Fill missing lane counts with the median (robust to outliers)
    median_lanes = df["lanes"].median()
    df["lanes"].fillna(
        median_lanes if not np.isnan(median_lanes) else 1.0, inplace=True
    )

    # -- length ----------------------------------------------------------------
    # osmnx always computes 'length' in metres
    df["length"] = (
        pd.to_numeric(df.get("length", pd.Series(0.0)), errors="coerce")
        .fillna(0.0)
    )

    # -- oneway ----------------------------------------------------------------
    if "oneway" in df.columns:
        df["oneway"] = df["oneway"].astype(bool).astype(int)
    else:
        df["oneway"] = 0

    features  = ["highway", "lit", "lanes", "length", "oneway", "geometry"]
    available = [c for c in features if c in df.columns]
    result    = df[available].reset_index(drop=True)

    print(f"  [OK] Physical features extracted for {len(result):,} edges")
    print(f"       Columns: {[c for c in available if c != 'geometry']}")
    return result


def compute_nearest_poi_distance(
    edges_gdf: gpd.GeoDataFrame,
    poi_gdf:   gpd.GeoDataFrame,
    col_name:  str,
) -> pd.Series:
    """
    For every street edge (represented by its midpoint), calculate the
    Euclidean distance in metres to the nearest POI.

    Strategy:
      1. Project both layers to a metric CRS (UTM zone 43N -- covers Bengaluru).
      2. Compute the midpoint of each edge geometry.
      3. Vectorised distance search via GeoSeries.distance().

    If no POIs exist (empty GeoDataFrame), returns a constant high value.

    Scalable alternative for large datasets (spatial index):
      tree = poi_proj.sindex
      nearest_idx = [list(tree.nearest(pt.bounds))[0] for pt in midpoints]
      distances = [pt.distance(poi_proj.geometry.iloc[i])
                   for pt, i in zip(midpoints, nearest_idx)]
    """
    METRIC_CRS = "EPSG:32643"  # WGS 84 / UTM zone 43N -- Bengaluru
    MAX_DIST   = 5_000.0       # fallback distance (metres) when no POIs found

    if poi_gdf.empty:
        print(
            f"  [WARN] No POIs for '{col_name}'; "
            f"assigning fallback distance {MAX_DIST} m"
        )
        return pd.Series(MAX_DIST, index=range(len(edges_gdf)), name=col_name)

    # Project to metric CRS for accurate distance computation
    edges_proj = edges_gdf.to_crs(METRIC_CRS)
    poi_proj   = poi_gdf.to_crs(METRIC_CRS)

    # Use edge midpoints (centroid of each linestring)
    midpoints = edges_proj.geometry.centroid

    distances = midpoints.apply(
        lambda pt: poi_proj.geometry.distance(pt).min()
    )
    distances.name = col_name
    distances = distances.reset_index(drop=True)
    return distances


def engineer_spatial_features(
    edges_df:      pd.DataFrame,
    police_gdf:    gpd.GeoDataFrame,
    nightlife_gdf: gpd.GeoDataFrame,
) -> pd.DataFrame:
    """
    Attach spatial proximity features (distance to police, distance to
    nearest nightlife venue) to the physical edge feature DataFrame.
    """
    print("\n[STEP 2b] Computing spatial proximity features ...")

    # Rebuild a GeoDataFrame from the working DataFrame (geometry preserved)
    edges_geo = gpd.GeoDataFrame(edges_df, geometry="geometry", crs="EPSG:4326")

    dist_police    = compute_nearest_poi_distance(
        edges_geo, police_gdf, "dist_police_m"
    )
    dist_nightlife = compute_nearest_poi_distance(
        edges_geo, nightlife_gdf, "dist_nightlife_m"
    )

    edges_df = edges_df.copy()
    edges_df["dist_police_m"]    = dist_police.values
    edges_df["dist_nightlife_m"] = dist_nightlife.values

    print(f"  [OK] dist_police_m    -- mean: {dist_police.mean():.1f} m")
    print(f"  [OK] dist_nightlife_m -- mean: {dist_nightlife.mean():.1f} m")
    return edges_df


# =============================================================================
# STEP 3 -- Synthetic Safety Score Generation
# =============================================================================

# Road types considered relatively safe (yield a higher base score)
SAFE_ROAD_TYPES = {
    "residential", "living_street", "pedestrian",
    "footway", "cycleway", "path",
    "primary", "secondary", "tertiary",  # arterial roads: more traffic/visibility
}
RISKY_ROAD_TYPES = {
    "unclassified", "track", "service",
    "tertiary_link", "secondary_link",
    "trunk", "trunk_link",  # high-speed roads, typically poor for pedestrians
}


def compute_safety_score(row: pd.Series) -> float:
    """
    Heuristic function to compute a synthetic Safety_Score in [1.0, 10.0].

    Scoring table:
      Component              | Adjustment    | Reasoning
      -----------------------|---------------|---------------------------------
      Base score             |  5.0          | Neutral starting point
      Street lighting (yes)  | +2.0          | Lit streets increase safety
      Street lighting (no)   | -1.5          | Dark streets decrease safety
      Safe road type         | +1.5          | Residential / pedestrian zone
      Risky road type        | -1.0          | Unclassified / track road
      Proximity to police    | +0 to +1.5    | Closer = safer (exp decay)
      Proximity to nightlife | -0 to -1.5    | Closer = riskier (exp decay)
      Multi-lane road        | -0.5          | Lanes > 2 increases traffic risk
      One-way road           | +0.3          | Slightly better traffic flow
    """
    score = 5.0

    # -- Lighting --------------------------------------------------------------
    lit = str(row.get("lit", "unknown")).lower()
    if lit == "yes":
        score += 2.0
    elif lit == "no":
        score -= 1.5

    # -- Road type -------------------------------------------------------------
    highway = str(row.get("highway", "unknown")).lower()
    if highway in SAFE_ROAD_TYPES:
        score += 1.5
    elif highway in RISKY_ROAD_TYPES:
        score -= 1.0

    # -- Police proximity ------------------------------------------------------
    # Exponential decay: max +1.5 at 0 m, approaches 0 beyond ~500 m
    dist_police = row.get("dist_police_m", 5000.0)
    score += 1.5 * np.exp(-dist_police / 500.0)

    # -- Nightlife proximity ---------------------------------------------------
    # Penalise proximity; max -1.5 at 0 m, approaches 0 beyond ~300 m
    dist_nightlife = row.get("dist_nightlife_m", 5000.0)
    score -= 1.5 * np.exp(-dist_nightlife / 300.0)

    # -- Traffic volume proxy --------------------------------------------------
    lanes = row.get("lanes", 1.0)
    if lanes > 2:
        score -= 0.5

    # -- One-way roads ---------------------------------------------------------
    if row.get("oneway", 0) == 1:
        score += 0.3

    # Clamp to valid range
    return float(np.clip(score, 1.0, 10.0))


def generate_target_variable(feature_df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply the scoring heuristic row-wise and add Gaussian noise to simulate
    real-world label uncertainty / measurement error.

    Noise: N(0, sigma=0.3) -- roughly +/-0.6 at the 2-sigma level.
    """
    print("\n[STEP 3] Generating synthetic Safety_Score target variable ...")

    df = feature_df.copy()
    base_scores = df.apply(compute_safety_score, axis=1)

    noise = np.random.normal(loc=0.0, scale=0.3, size=len(df))
    df["Safety_Score"] = np.clip(base_scores + noise, 1.0, 10.0)

    print(
        f"  [OK] Safety_Score generated -- "
        f"mean: {df['Safety_Score'].mean():.2f}  "
        f"std: {df['Safety_Score'].std():.2f}  "
        f"range: [{df['Safety_Score'].min():.2f}, {df['Safety_Score'].max():.2f}]"
    )
    return df


# =============================================================================
# STEP 4 -- Model Training (XGBoost Regression Pipeline)
# =============================================================================

FEATURE_COLS     = [
    "highway", "lit", "lanes", "length", "oneway",
    "dist_police_m", "dist_nightlife_m",
]
CATEGORICAL_COLS = ["highway", "lit"]
NUMERIC_COLS     = ["lanes", "length", "oneway", "dist_police_m", "dist_nightlife_m"]
TARGET_COL       = "Safety_Score"


def build_training_dataset(df: pd.DataFrame) -> tuple:
    """
    Select and validate model features and the target variable.
    Rows with remaining NaN in the feature matrix are dropped.
    """
    available = [c for c in FEATURE_COLS if c in df.columns]
    model_df  = df[available + [TARGET_COL]].dropna(subset=available)

    X = model_df[available]
    y = model_df[TARGET_COL]
    print(f"\n[STEP 4] Training dataset shape: X={X.shape} | y={y.shape}")
    return X, y


def train_xgboost_pipeline(X: pd.DataFrame, y: pd.Series) -> tuple:
    """
    Build and fit a scikit-learn Pipeline consisting of:
      1. ColumnTransformer -- One-Hot Encode categoricals, pass numerics through
      2. XGBRegressor      -- Gradient-boosted tree ensemble

    Returns:
        pipeline : fitted Pipeline
        X_train, X_test, y_train, y_test : train/test splits for evaluation
    """
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_SEED
    )
    print(f"  Train size: {len(X_train):,} | Test size: {len(X_test):,}")

    # Only include columns that actually exist in X
    cat_cols = [c for c in CATEGORICAL_COLS if c in X.columns]
    num_cols = [c for c in NUMERIC_COLS      if c in X.columns]

    preprocessor = ColumnTransformer(
        transformers=[
            ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),
            ("num", "passthrough", num_cols),
        ],
        remainder="drop",
    )

    xgb_model = XGBRegressor(
        n_estimators     = 300,
        max_depth        = 5,
        learning_rate    = 0.05,
        subsample        = 0.8,
        colsample_bytree = 0.8,
        random_state     = RANDOM_SEED,
        verbosity        = 0,
        n_jobs           = -1,
    )

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("model",        xgb_model),
    ])

    print("  Training XGBRegressor ... ", end="", flush=True)
    pipeline.fit(X_train, y_train)
    print("done.")

    return pipeline, X_train, X_test, y_train, y_test


# =============================================================================
# STEP 5 -- Evaluation & Output
# =============================================================================

def evaluate_model(
    pipeline: Pipeline,
    X_test:   pd.DataFrame,
    y_test:   pd.Series,
) -> dict:
    """
    Compute and display regression metrics on the held-out test set.

    Metrics:
      R2   -- coefficient of determination (1.0 = perfect fit)
      RMSE -- root mean squared error (in Safety_Score units)
    """
    y_pred = pipeline.predict(X_test)

    r2   = r2_score(y_test, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))

    print("\n" + "=" * 60)
    print("  MODEL EVALUATION -- Test Set")
    print("=" * 60)
    print(f"  R2   (coefficient of determination) : {r2:.4f}")
    print(f"  RMSE (root mean squared error)       : {rmse:.4f}")
    print("=" * 60)

    return {"r2": r2, "rmse": rmse, "y_pred": y_pred}


def show_sample_predictions(
    pipeline:  Pipeline,
    X_test:    pd.DataFrame,
    full_df:   pd.DataFrame,
    y_pred:    np.ndarray,
    n_samples: int = 5,
) -> None:
    """
    Display a formatted table of sample street edges showing:
      - key OSM features
      - ground-truth synthetic safety score
      - model-predicted safety score
    """
    display_cols = [
        c for c in
        ["highway", "lit", "lanes", "dist_police_m", "dist_nightlife_m", "Safety_Score"]
        if c in full_df.columns
    ]

    sample_indices = X_test.index[:n_samples]
    sample_df = full_df.loc[sample_indices, display_cols].copy()

    sample_df["Predicted_Score"]  = np.round(y_pred[:n_samples], 2)
    sample_df["Safety_Score"]     = sample_df["Safety_Score"].round(2)
    sample_df["dist_police_m"]    = sample_df["dist_police_m"].round(1)
    sample_df["dist_nightlife_m"] = sample_df["dist_nightlife_m"].round(1)

    print("\n  SAMPLE PREDICTIONS (5 Street Edges)")
    print("-" * 80)
    print(sample_df.to_string(index=True))
    print("-" * 80)


# =============================================================================
# MAIN ORCHESTRATOR  (standalone entry-point)
# =============================================================================

def run_pipeline(
    lat:      float,
    lon:      float,
    radius_m: int,
    verbose:  bool = True,
) -> tuple:
    """
    Core pipeline: download OSM data, engineer features, train XGBoost, and
    return everything the route-finder needs.

    Args:
        lat      : Centroid latitude of the target area
        lon      : Centroid longitude of the target area
        radius_m : Search radius in metres
        verbose  : Whether to print progress messages

    Returns:
        G         : NetworkX MultiDiGraph (raw OSM street graph)
        edges_gdf : GeoDataFrame of edges WITH Safety_Score column
        ml_pipe   : Fitted sklearn Pipeline (preprocessor + XGBRegressor)
    """
    import osmnx as ox

    if verbose:
        print(f"\n[PIPELINE] Running for centre ({lat}, {lon}), radius {radius_m} m")

    # Step 1 — Data acquisition
    G = ox.graph_from_point((lat, lon), dist=radius_m, network_type="all", retain_all=False)
    nodes_gdf, edges_gdf = ox.graph_to_gdfs(G)
    if verbose:
        print(f"  [OK] Network: {len(nodes_gdf):,} nodes | {len(edges_gdf):,} edges")

    police_gdf, nightlife_gdf = download_pois(lat, lon, radius_m)

    # Step 2 — Feature engineering
    feature_df = extract_physical_features(edges_gdf)
    feature_df = engineer_spatial_features(feature_df, police_gdf, nightlife_gdf)

    # Step 3 — Synthetic target
    model_df = generate_target_variable(feature_df)

    # Build a GeoDataFrame that keeps geometry + Safety_Score for the route-finder
    scored_gdf = gpd.GeoDataFrame(
        model_df, geometry=feature_df["geometry"].values, crs="EPSG:4326"
    )

    # Step 4 — Model training (drop geometry for ML)
    train_df = model_df.drop(columns=["geometry"], errors="ignore")
    X, y     = build_training_dataset(train_df)
    ml_pipe, X_train, X_test, y_train, y_test = train_xgboost_pipeline(X, y)

    if verbose:
        evaluate_model(ml_pipe, X_test, y_test)

    return G, scored_gdf, ml_pipe


def score_graph_edges(
    G:         object,          # nx.MultiDiGraph
    scored_gdf: gpd.GeoDataFrame,
    ml_pipe:   Pipeline,
) -> object:
    """
    Attach ML-predicted Safety_Score to every edge in the NetworkX graph G
    as a graph attribute, and add a 'safety_cost' weight (11 - score) so that
    Dijkstra's algorithm maximises safety (lower cost = safer).

    The mapping from GeoDataFrame index (u, v, key) to G edges is done by
    aligning on the MultiIndex that osmnx creates.

    Returns:
        G  : The same graph with edge attributes 'safety_score' and 'safety_cost'
    """
    import networkx as nx

    # Build a lookup: (u, v, key) -> Safety_Score
    score_lookup: dict = {}

    # scored_gdf has a MultiIndex: (u, v, key)
    for idx, row in scored_gdf.iterrows():
        if isinstance(idx, tuple) and len(idx) == 3:
            u, v, k = idx
        else:
            continue
        score_lookup[(u, v, k)] = float(row.get("Safety_Score", 5.0))

    # Write attributes into G
    for u, v, k, data in G.edges(data=True, keys=True):
        score = score_lookup.get((u, v, k), 5.0)
        data["safety_score"] = score
        data["safety_cost"]  = 11.0 - score   # invert: lower cost = safer

    if not nx.is_empty(G):
        print(f"  [OK] Safety scores attached to {G.number_of_edges():,} edges in graph")

    return G


def main() -> None:
    print("=" * 70)
    print("  PROJECT PRAHARI -- Urban Street Safety ML Pipeline")
    print(f"  Area of Interest : {PLACE_NAME}")
    print(f"  Centre           : ({CENTRE_LAT}, {CENTRE_LON})")
    print(f"  Radius           : {RADIUS_M} m")
    print("=" * 70)

    G, scored_gdf, ml_pipe = run_pipeline(CENTRE_LAT, CENTRE_LON, RADIUS_M, verbose=True)
    print("\n[DONE] PRAHARI pipeline completed successfully.\n")


if __name__ == "__main__":
    main()
