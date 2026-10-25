"""
================================================================================
  PROJECT PRAHARI -- Safe Route Finder
================================================================================
Usage:
    python prahari_route_finder.py

Prompts for start and destination, geocodes them, downloads the OSM street
network, scores every road edge with the Prahari safety model, and computes
three routes: safest, shortest, balanced.

Output:
  - Terminal report with per-route statistics
  - Interactive HTML map: prahari_route_map.html

Dependencies:
    pip install osmnx geopandas pandas scikit-learn xgboost shapely numpy folium
================================================================================
"""

import sys
import io
import os
import math

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import warnings
warnings.filterwarnings("ignore")

import numpy as np
import networkx as nx

try:
    import osmnx as ox
except ImportError:
    raise ImportError("osmnx is required: pip install osmnx")

try:
    import folium
except ImportError:
    folium = None
    print("[WARN] folium not installed -- HTML map skipped (pip install folium)")

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from prahari_safety_pipeline import (
    download_pois,
    extract_physical_features,
    engineer_spatial_features,
    generate_target_variable,
    build_training_dataset,
    train_xgboost_pipeline,
    score_graph_edges,
)


# =============================================================================
# STEP A -- Geocoding and Graph Download
# =============================================================================

def geocode_address(address: str) -> tuple:
    """Geocode a free-text address to (lat, lon) using Nominatim via osmnx."""
    print(f"  Geocoding: \"{address}\" ...", end=" ", flush=True)
    try:
        lat, lon = ox.geocode(address)
        print(f"-> ({lat:.5f}, {lon:.5f})")
        return lat, lon
    except Exception as exc:
        raise ValueError(
            f"Could not geocode \"{address}\". "
            f"Try a more specific address or add the city name.\n  Error: {exc}"
        ) from exc


def compute_bounding_box(lat1: float, lon1: float,
                          lat2: float, lon2: float,
                          padding: float = 1.4) -> tuple:
    """
    Return the centre (lat, lon) and radius (metres) of a circle that encloses
    both points with a padding factor.
    """
    centre_lat = (lat1 + lat2) / 2
    centre_lon = (lon1 + lon2) / 2
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a    = (math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlon / 2) ** 2)
    dist_m   = 2 * 6_371_000.0 * math.asin(math.sqrt(a))
    radius_m = max(int((dist_m / 2) * padding), 800)
    print(f"  Centre: ({centre_lat:.5f}, {centre_lon:.5f})")
    print(f"  Distance between points: {dist_m/1000:.2f} km")
    print(f"  Download radius: {radius_m:,} m")
    return centre_lat, centre_lon, radius_m


def download_area_graph(centre_lat: float, centre_lon: float, radius_m: int):
    """Download OSM street network and return raw NetworkX graph."""
    print(f"\n[A] Downloading street network ({radius_m:,} m radius) ...")
    G = ox.graph_from_point(
        (centre_lat, centre_lon),
        dist=radius_m,
        network_type="all",
        retain_all=False,
    )
    print(f"  [OK] {G.number_of_nodes():,} nodes | {G.number_of_edges():,} edges")
    return G


# =============================================================================
# STEP B -- Safety Scoring
# =============================================================================

def build_safety_weighted_graph(G):
    """Run Prahari pipeline on graph G and attach safety_score / safety_cost."""
    print("\n[B] Running Prahari safety scoring pipeline ...")
    import geopandas as gpd

    _, edges_gdf = ox.graph_to_gdfs(G)
    lats = [d["y"] for _, d in G.nodes(data=True)]
    lons = [d["x"] for _, d in G.nodes(data=True)]
    clat = (min(lats) + max(lats)) / 2
    clon = (min(lons) + max(lons)) / 2
    rm   = max(int(max(
        (max(lats) - min(lats)) * 111_000,
        (max(lons) - min(lons)) * 111_000 * math.cos(math.radians(clat))
    ) / 2 * 1.2), 800)

    police_gdf, nightlife_gdf = download_pois(clat, clon, rm)
    feature_df = extract_physical_features(edges_gdf)
    feature_df = engineer_spatial_features(feature_df, police_gdf, nightlife_gdf)
    model_df   = generate_target_variable(feature_df)
    train_df   = model_df.drop(columns=["geometry"], errors="ignore")
    X, y       = build_training_dataset(train_df)
    ml_pipe, *_ = train_xgboost_pipeline(X, y)

    scored_gdf = gpd.GeoDataFrame(
        model_df, geometry=feature_df["geometry"].values, crs="EPSG:4326"
    )
    G = score_graph_edges(G, scored_gdf, ml_pipe)
    return G


# =============================================================================
# STEP C -- Route Finding
# =============================================================================

def snap_to_graph(G, lat: float, lon: float, label: str) -> int:
    """Find nearest graph node to (lat, lon)."""
    node_id   = ox.distance.nearest_nodes(G, lon, lat)
    node_data = G.nodes[node_id]
    print(f"  {label} snapped -> node {node_id} "
          f"({node_data.get('y', '?'):.5f}, {node_data.get('x', '?'):.5f})")
    return node_id


def _path_stats(G, path: list) -> dict:
    """Aggregate statistics for a node-list path."""
    edges, scores, names = [], [], []
    dist = 0.0
    for u, v in zip(path[:-1], path[1:]):
        ek   = G[u][v]
        best = min(ek, key=lambda k: ek[k].get("safety_cost", 6.0))
        data = ek[best]
        edges.append((u, v, data))
        dist   += float(data.get("length", 0.0))
        scores.append(float(data.get("safety_score", 5.0)))
        name = data.get("name", "")
        if isinstance(name, list):
            name = name[0] if name else ""
        names.append(str(name) if name else "(unnamed road)")
    return {
        "edges":        edges,
        "total_dist_m": dist,
        "avg_safety":   float(np.mean(scores)) if scores else 0.0,
        "min_safety":   float(np.min(scores))  if scores else 0.0,
        "road_names":   names,
        "scores":       scores,
        "path":         path,
    }


def find_routes(G, origin: int, dest: int) -> dict:
    """Compute safest, shortest, and balanced routes."""
    print("\n[C] Computing routes ...")
    max_len = max((d.get("length", 0) for _, _, d in G.edges(data=True)), default=1.0)

    def balanced_w(u, v, data):
        if isinstance(data, dict) and any(isinstance(x, dict) for x in data.values()):
            best = min(data.values(), key=lambda d: d.get("safety_cost", 6.0))
            sc, ln = best.get("safety_cost", 6.0), best.get("length", 50.0)
        else:
            sc, ln = data.get("safety_cost", 6.0), data.get("length", 50.0)
        return 0.6 * (sc / 10.0) + 0.4 * (ln / max(max_len, 1.0))

    specs = [
        ("safest",   "safety_cost", "Safest   (max safety)"),
        ("shortest", "length",      "Shortest (min distance)"),
        ("balanced", balanced_w,    "Balanced (60% safety + 40% dist)"),
    ]
    routes = {}
    for key, weight, label in specs:
        print(f"  {label} ...", end=" ", flush=True)
        try:
            path = nx.shortest_path(G, origin, dest, weight=weight)
            stats = _path_stats(G, path)
            routes[key] = stats
            print(f"done ({len(path)-1} segs, "
                  f"{stats['total_dist_m']/1000:.2f} km, "
                  f"avg safety {stats['avg_safety']:.2f})")
        except nx.NetworkXNoPath:
            print("NO PATH FOUND")
            routes[key] = None
    return routes


# =============================================================================
# STEP D -- Terminal Report
# =============================================================================

def _bar(score: float, width: int = 20) -> str:
    filled = int(round((score - 1) / 9 * width))
    return "[" + "#" * filled + "." * (width - filled) + f"] {score:.1f}/10"


def print_report(routes: dict, start_label: str, dest_label: str) -> None:
    W = 72
    SEP = "=" * W
    print(f"\n{SEP}")
    print("  PROJECT PRAHARI -- Route Safety Report")
    print(f"  From : {start_label}")
    print(f"  To   : {dest_label}")
    print(SEP)

    print(f"\n  {'Route':<12} {'Distance':>10}  {'Avg Safety':>12}  {'Min Safety':>12}")
    print("  " + "-" * 58)
    labels = [("safest", "Safest"), ("shortest", "Shortest"), ("balanced", "Balanced")]
    for key, lbl in labels:
        r = routes.get(key)
        if r is None:
            print(f"  {lbl:<12}  No path found")
        else:
            print(f"  {lbl:<12}  {r['total_dist_m']/1000:>8.2f} km  "
                  f"{r['avg_safety']:>10.2f}/10  {r['min_safety']:>10.2f}/10")
    print()

    for key, lbl in labels:
        r = routes.get(key)
        if r is None:
            continue
        print(f"  {SEP[2:]}")
        print(f"  {lbl.upper()} ROUTE")
        print(f"    Distance     : {r['total_dist_m']/1000:.2f} km")
        print(f"    Avg Safety   : {_bar(r['avg_safety'])}")
        print(f"    Worst Segment: {_bar(r['min_safety'])}")
        print(f"    Segments     : {len(r['edges'])}")
        print(f"\n    # {'Road':<35}  Score  Bar")
        print(f"    - {'----':<35}  -----  ---")
        prev, cnt = None, 0
        for name, sc in zip(r["road_names"], r["scores"]):
            if name != prev:
                cnt += 1
                road = (name[:33] + "..") if len(name) > 35 else name
                print(f"    {cnt:>2}  {road:<35}  {sc:>5.1f}  {_bar(sc, 10)}")
                prev = name
        print()
    print(SEP + "\n")


# =============================================================================
# STEP E -- Folium Map
# =============================================================================

COLORS = {"safest": "#00C896", "shortest": "#FF6B6B", "balanced": "#FFD166"}
ROUTE_NAMES = {"safest": "Safest Route", "shortest": "Shortest Route", "balanced": "Balanced Route"}


def build_map(G, routes, slat, slon, dlat, dlon, slabel, dlabel, out="prahari_route_map.html"):
    if folium is None:
        print("\n[E] Skipping map (folium not installed).")
        return
    print(f"\n[E] Building interactive HTML map ...")
    fmap = folium.Map(
        location=[(slat+dlat)/2, (slon+dlon)/2],
        zoom_start=14,
        tiles="CartoDB dark_matter",
    )
    for key in ["shortest", "balanced", "safest"]:
        r = routes.get(key)
        if r is None:
            continue
        color = COLORS[key]
        coords = []
        for u, v, data in r["edges"]:
            geom = data.get("geometry")
            if geom is not None:
                coords.extend([(y, x) for x, y in geom.coords])
            else:
                coords.append((G.nodes[u]["y"], G.nodes[u]["x"]))
                coords.append((G.nodes[v]["y"], G.nodes[v]["x"]))
        if not coords:
            continue
        tip = (f"<b>{ROUTE_NAMES[key]}</b><br>"
               f"Avg Safety: {r['avg_safety']:.2f}/10 | "
               f"Dist: {r['total_dist_m']/1000:.2f} km")
        folium.PolyLine(
            coords, color=color,
            weight=7 if key=="safest" else 4,
            opacity=0.85, tooltip=tip,
            popup=folium.Popup(tip, max_width=280)
        ).add_to(fmap)

    folium.Marker([slat,slon], tooltip="Start",
        popup=folium.Popup(f"<b>Start</b><br>{slabel}", max_width=200),
        icon=folium.Icon(color="green", icon="play", prefix="fa")).add_to(fmap)
    folium.Marker([dlat,dlon], tooltip="Destination",
        popup=folium.Popup(f"<b>Destination</b><br>{dlabel}", max_width=200),
        icon=folium.Icon(color="red", icon="flag", prefix="fa")).add_to(fmap)

    legend = """
    <div style="position:fixed;bottom:30px;left:30px;z-index:9999;
                background:rgba(20,20,30,0.92);color:#eee;
                padding:14px 18px;border-radius:10px;
                font-family:'Segoe UI',sans-serif;font-size:13px;
                border:1px solid rgba(255,255,255,0.15);box-shadow:0 4px 20px rgba(0,0,0,.5)">
      <div style="font-weight:700;font-size:15px;margin-bottom:10px;color:#00C896">
        PRAHARI Route Map
      </div>
      <div><span style="display:inline-block;width:28px;height:4px;background:#00C896;border-radius:2px;margin-right:8px"></span>Safest Route</div>
      <div style="margin-top:6px"><span style="display:inline-block;width:28px;height:4px;background:#FFD166;border-radius:2px;margin-right:8px"></span>Balanced Route</div>
      <div style="margin-top:6px"><span style="display:inline-block;width:28px;height:4px;background:#FF6B6B;border-radius:2px;margin-right:8px"></span>Shortest Route</div>
      <div style="margin-top:10px;font-size:11px;color:#888">Click a route for details</div>
    </div>"""
    fmap.get_root().html.add_child(folium.Element(legend))
    fmap.save(out)
    print(f"  [OK] Map saved -> {os.path.abspath(out)}")


# =============================================================================
# ENTRY POINT
# =============================================================================

def main():
    print("=" * 72)
    print("  PROJECT PRAHARI -- Safe Route Finder")
    print("  Powered by OSM + XGBoost Safety Scoring")
    print("=" * 72)
    print()
    print("  Enter full addresses or well-known place names.")
    print("  Tip: include the city for better accuracy.")
    print("       e.g.  'Forum Mall, Koramangala, Bengaluru'")
    print()

    start_label = input("  Start       : ").strip()
    dest_label  = input("  Destination : ").strip()
    if not start_label or not dest_label:
        print("[ERROR] Both start and destination are required.")
        sys.exit(1)
    print()

    print("[1] Geocoding ...")
    start_lat, start_lon = geocode_address(start_label)
    dest_lat,  dest_lon  = geocode_address(dest_label)

    print("\n[2] Computing area ...")
    clat, clon, rm = compute_bounding_box(start_lat, start_lon, dest_lat, dest_lon)

    G = download_area_graph(clat, clon, rm)
    G = build_safety_weighted_graph(G)

    print("\n[3] Snapping to road network ...")
    origin = snap_to_graph(G, start_lat, start_lon, "Start      ")
    dest   = snap_to_graph(G, dest_lat,  dest_lon,  "Destination")

    routes = find_routes(G, origin, dest)
    print_report(routes, start_label, dest_label)

    map_path = os.path.join(_here, "prahari_route_map.html")
    build_map(G, routes, start_lat, start_lon, dest_lat, dest_lon,
              start_label, dest_label, out=map_path)

    print("  Open prahari_route_map.html in any browser to see the interactive map.")
    print()


if __name__ == "__main__":
    main()
