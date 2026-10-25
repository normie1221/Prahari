"""
PRAHARI Navigation Service — configuration.

All values are overridable via environment variables so the service behaves
the same in dev / staging / prod. Nothing sensitive is hard-coded.
"""
import os

# Where built area graphs + trained pipelines are persisted so we NEVER
# re-download OSM data or re-train XGBoost on every request (see
# app/services/area_registry.py for why this exists).
DATA_DIR = os.getenv("PRAHARI_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data", "areas"))

# Areas to pre-build ("warm") automatically on service startup, so the very
# first user request isn't the one paying the OSM-download + training cost.
# Format: "name:lat:lon:radius_m" pairs separated by ";"
# Example default covers the same Koramangala <-> Mantri Square corridor
# validated during development.
DEFAULT_WARM_AREAS = os.getenv(
    "PRAHARI_WARM_AREAS",
    "bengaluru_core:12.9634:77.5975:6000",
)

# Padding multiplier applied to the straight-line origin/destination distance
# when deciding how large an area graph to build (mirrors compute_bounding_box
# in the original model, exposed here so the service can decide when an
# existing cached area is "big enough" to cover a new request).
BBOX_PADDING = float(os.getenv("PRAHARI_BBOX_PADDING", "1.4"))
MIN_RADIUS_M = int(os.getenv("PRAHARI_MIN_RADIUS_M", "800"))

# If a cached area's centre is within this many metres of what a new request
# needs, and the cached radius already covers the requested radius, reuse it
# instead of building a new one. Keeps a handful of areas warm rather than
# one per unique query.
AREA_REUSE_SLACK_M = int(os.getenv("PRAHARI_AREA_REUSE_SLACK_M", "1500"))

# Travel-speed assumptions used ONLY for ETA estimation (the model itself
# has no timing/traffic data). These are explicit, documented estimates —
# not a claim about real-time traffic.
WALKING_SPEED_KMH = float(os.getenv("PRAHARI_WALKING_SPEED_KMH", "4.5"))
DRIVING_SPEED_KMH = float(os.getenv("PRAHARI_DRIVING_SPEED_KMH", "22"))

# Shared secret the Node.js backend must send so this internal service is
# never called directly by end-user clients.
INTERNAL_SERVICE_TOKEN = os.getenv("PRAHARI_INTERNAL_TOKEN", "")

CORS_ORIGINS = os.getenv("PRAHARI_CORS_ORIGINS", "http://localhost:4000").split(",")

# Cache freshness: after this many hours, a warm area is considered stale and
# eligible for background rebuild (new lighting/police/venue data on OSM).
AREA_MAX_AGE_HOURS = int(os.getenv("PRAHARI_AREA_MAX_AGE_HOURS", "168"))  # 7 days

# Longest straight-line origin->destination distance the service will plan.
# Longer trips need a city-scale area build (very slow, very memory hungry);
# reject them with a clear message instead of hanging.
MAX_ROUTE_KM = float(os.getenv("PRAHARI_MAX_ROUTE_KM", "30"))
