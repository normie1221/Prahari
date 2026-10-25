from typing import Optional, Literal
from pydantic import BaseModel, Field


class LatLon(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class RouteRequest(BaseModel):
    origin: LatLon
    destination: LatLon
    mode: Literal["walking", "driving"] = "walking"
    departureTime: Optional[str] = None


class WarmAreaRequest(BaseModel):
    name: str
    lat: float
    lon: float
    radiusM: int = Field(1500, ge=400, le=15000)
