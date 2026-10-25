"""
Live route requests must never block on a multi-minute area build.
These tests pin the non-blocking contract of get_area_for_points_nonblocking()
and the /api/v1/route endpoint (202 while building -> 200 when ready).
"""
import time
import threading
import networkx as nx
import pytest

from app.services import area_registry
from app import config

# Two points ~1.4 km apart in Koramangala
O = (12.9357, 77.6241)
D = (12.9440, 77.6320)


def fake_graph(lat, lon, radius_m):
    """A small grid of real-looking edges around (lat, lon), already safety-scored."""
    G = nx.MultiDiGraph()
    G.graph["crs"] = "epsg:4326"
    n = 0
    ids = {}
    step = 0.004
    for i in range(-3, 4):
        for j in range(-3, 4):
            ids[(i, j)] = n
            G.add_node(n, y=lat + i * step, x=lon + j * step)
            n += 1
    score = 3.0
    for (i, j), u in ids.items():
        for di, dj in ((1, 0), (0, 1)):
            if (i + di, j + dj) in ids:
                v = ids[(i + di, j + dj)]
                score = 3.0 + ((i * 7 + j * 3) % 6)  # varies 3..8
                for a, b in ((u, v), (v, u)):
                    G.add_edge(a, b, key=0, length=440.0, highway="residential", name=f"Road {i},{j}",
                               safety_score=score, safety_cost=11.0 - score)
    return G


@pytest.fixture
def slow_builds(monkeypatch):
    """Make builds take ~0.4s and count how many really ran (and the max concurrency)."""
    stats = {"builds": 0, "concurrent": 0, "max_concurrent": 0}
    lock = threading.Lock()

    def download(lat, lon, radius_m):
        with lock:
            stats["builds"] += 1
            stats["concurrent"] += 1
            stats["max_concurrent"] = max(stats["max_concurrent"], stats["concurrent"])
        time.sleep(0.4)
        with lock:
            stats["concurrent"] -= 1
        return fake_graph(lat, lon, radius_m)

    monkeypatch.setattr(area_registry.rf, "download_area_graph", download)
    monkeypatch.setattr(area_registry, "build_safety_weighted_graph_with_features", lambda G: G)
    return stats


def wait_ready(timeout=5.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = area_registry.get_area_for_points_nonblocking(*O, *D)
        if r["status"] == "ready":
            return r
        time.sleep(0.05)
    raise AssertionError("area never became ready")


def test_new_area_returns_building_immediately_then_ready(slow_builds):
    t0 = time.time()
    r = area_registry.get_area_for_points_nonblocking(*O, *D)
    assert r["status"] == "building"
    assert time.time() - t0 < 0.2, "a live request must not wait for the build"
    # polling during the build must not start a second build
    for _ in range(5):
        assert area_registry.get_area_for_points_nonblocking(*O, *D)["status"] in ("building", "ready")
    r = wait_ready()
    assert r["G"].number_of_edges() > 0 and r["stale"] is False
    assert slow_builds["builds"] == 1


def test_stale_area_is_served_immediately_and_refreshed_in_background(slow_builds, monkeypatch):
    wait_ready_first = area_registry.get_area_for_points_nonblocking(*O, *D)
    assert wait_ready_first["status"] == "building"
    wait_ready()
    assert slow_builds["builds"] == 1
    # make every area look older than the max age
    monkeypatch.setattr(config, "AREA_MAX_AGE_HOURS", -1)
    t0 = time.time()
    r = area_registry.get_area_for_points_nonblocking(*O, *D)
    assert r["status"] == "ready" and r["stale"] is True
    assert time.time() - t0 < 0.2, "stale area must be served without waiting for the refresh"
    # repeated requests while refreshing do not start more rebuilds
    for _ in range(5):
        area_registry.get_area_for_points_nonblocking(*O, *D)
    time.sleep(0.8)
    assert slow_builds["builds"] == 2


def test_failed_build_is_reported_once_then_retried(monkeypatch):
    calls = {"n": 0}

    def boom(lat, lon, radius_m):
        calls["n"] += 1
        raise RuntimeError("Overpass API timed out")

    monkeypatch.setattr(area_registry.rf, "download_area_graph", boom)
    assert area_registry.get_area_for_points_nonblocking(*O, *D)["status"] == "building"
    time.sleep(0.3)
    r = area_registry.get_area_for_points_nonblocking(*O, *D)
    assert r["status"] == "failed" and "Overpass" in r["error"]
    # the next request retries instead of being stuck on the old error
    assert area_registry.get_area_for_points_nonblocking(*O, *D)["status"] == "building"
    time.sleep(0.3)
    assert calls["n"] == 2


def test_background_builds_never_overlap(slow_builds):
    """Two different new areas requested together are built one at a time."""
    area_registry.get_area_for_points_nonblocking(*O, *D)
    area_registry.get_area_for_points_nonblocking(13.05, 77.59, 13.06, 77.60)
    time.sleep(1.2)
    assert slow_builds["builds"] == 2
    assert slow_builds["max_concurrent"] == 1


def test_route_api_202_while_building_then_200_with_routes(slow_builds, monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    monkeypatch.setattr(config, "INTERNAL_SERVICE_TOKEN", "")
    client = TestClient(main.app)
    body = {"origin": {"lat": O[0], "lon": O[1]}, "destination": {"lat": D[0], "lon": D[1]}, "mode": "walking"}

    first = client.post("/api/v1/route", json=body)
    assert first.status_code == 202
    assert first.json()["status"] == "building" and first.json()["retryAfterSeconds"] > 0

    for _ in range(60):
        res = client.post("/api/v1/route", json=body)
        if res.status_code == 200:
            break
        time.sleep(0.05)
    assert res.status_code == 200
    data = res.json()
    assert len(data["routes"]) == 3
    for r in data["routes"]:
        assert r["segments"] and len(r["segmentSafetyScores"]) == len(r["segments"])


def test_route_api_rejects_trips_beyond_max_distance(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    monkeypatch.setattr(config, "INTERNAL_SERVICE_TOKEN", "")
    client = TestClient(main.app)
    body = {"origin": {"lat": 12.97, "lon": 77.59}, "destination": {"lat": 13.40, "lon": 77.59}, "mode": "driving"}  # ~48 km
    res = client.post("/api/v1/route", json=body)
    assert res.status_code == 422
    assert "km" in res.json()["detail"]
