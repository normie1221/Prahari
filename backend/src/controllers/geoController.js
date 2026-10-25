import * as geoService from "../services/geoService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const nearFrom = (q) =>
  Number.isFinite(q.lat) && Number.isFinite(q.lon) ? { lat: q.lat, lon: q.lon } : undefined;

export const suggest = asyncHandler(async (req, res) => {
  const result = await geoService.suggest(req.query.q, nearFrom(req.query));
  res.set("Cache-Control", "private, max-age=300");
  res.json(result);
});

export const geocode = asyncHandler(async (req, res) => {
  const place = await geoService.geocode(req.query.q, nearFrom(req.query));
  if (!place) return res.status(404).json({ error: "NotFound", message: `Couldn't find "${req.query.q}". Try a more specific name or pick a suggestion.` });
  res.json({ place });
});

export const reverse = asyncHandler(async (req, res) => {
  const place = await geoService.reverse(req.query.lat, req.query.lon);
  res.json({ place });
});
