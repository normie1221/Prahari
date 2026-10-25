"""
PRAHARI Navigation Service
==========================
Internal microservice. Wraps the existing (unmodified) Python safety /
routing model behind a small HTTP API so the Node.js backend can consume it
without needing to run Python itself. This service is never called directly
by end-user clients — only by the Node backend, which authenticates real
users and forwards requests here with an internal service token.
"""
import logging
import time

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .schemas import RouteRequest, WarmAreaRequest
from .services import route_service, area_registry, heatmap_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("prahari.main")

app = FastAPI(
    title="PRAHARI Navigation Service",
    description="Internal adapter around the PRAHARI safety-scoring + routing model.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _check_internal_token(x_internal_token: str | None):
    if config.INTERNAL_SERVICE_TOKEN and x_internal_token != config.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing internal service token")


@app.on_event("startup")
def on_startup():
    logger.info("Starting PRAHARI Navigation Service — warming default areas in background")
    area_registry.warm_startup_areas()


@app.get("/health")
def health():
    return {"status": "ok", "areasWarm": len(area_registry.list_areas())}


@app.get("/api/v1/areas")
def areas(x_internal_token: str | None = Header(default=None)):
    _check_internal_token(x_internal_token)
    return {"areas": area_registry.list_areas()}


@app.post("/api/v1/areas/warm")
def warm_area(body: WarmAreaRequest, x_internal_token: str | None = Header(default=None)):
    """Admin-triggered pre-build of a new coverage area. This is the
    expensive path (OSM download + XGBoost training) — intended to be
    called during onboarding of a new city/campus, not per user request."""
    _check_internal_token(x_internal_token)
    try:
        meta = area_registry.build_area(body.name, body.lat, body.lon, body.radiusM)
        return {"area": meta}
    except Exception as exc:
        logger.exception("Failed to warm area")
        raise HTTPException(status_code=502, detail=f"Could not build area: {exc}") from exc


@app.post("/api/v1/route")
def compute_route(body: RouteRequest, x_internal_token: str | None = Header(default=None)):
    _check_internal_token(x_internal_token)
    t0 = time.time()
    try:
        result = route_service.compute_routes(
            origin={"lat": body.origin.lat, "lon": body.origin.lon},
            destination={"lat": body.destination.lat, "lon": body.destination.lon},
            mode=body.mode,
        )
    except route_service.RouteTooLong as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Start and destination are {exc.km:.0f} km apart. PRAHARI currently plans routes up to "
                   f"{config.MAX_ROUTE_KM:.0f} km - please choose closer points.",
        ) from exc
    except route_service.AreaNotReady as exc:
        info = exc.info
        if info["status"] == "failed":
            raise HTTPException(
                status_code=502,
                detail=f"Could not prepare the safety map for this area: {info.get('error', 'unknown error')}. Please try again.",
            ) from exc
        return JSONResponse(status_code=202, content={
            "status": "building",
            "message": "Preparing the safety map for this area for the first time. This usually takes 1-3 minutes; "
                       "later routes in this area are instant.",
            "retryAfterSeconds": 8,
            "elapsedSeconds": info.get("elapsedSeconds", 0),
            "areaRadiusKm": round(info.get("radiusM", 0) / 1000, 1),
            "queuedBehind": info.get("queuedBehind", 0),
        })
    except Exception as exc:
        logger.exception("Route computation failed")
        raise HTTPException(
            status_code=502,
            detail=f"Navigation model could not compute a route for this area: {exc}",
        ) from exc

    if not result["routes"]:
        raise HTTPException(status_code=404, detail="No path found between origin and destination")

    result["computeSeconds"] = round(time.time() - t0, 2)
    return result


@app.get("/api/v1/heatmap")
def heatmap(
    minLat: float = Query(...),
    minLon: float = Query(...),
    maxLat: float = Query(...),
    maxLon: float = Query(...),
    x_internal_token: str | None = Header(default=None),
):
    _check_internal_token(x_internal_token)
    edges = heatmap_service.get_heatmap_edges(minLat, minLon, maxLat, maxLon)
    return {"points": edges, "count": len(edges)}
