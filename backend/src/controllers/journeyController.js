import * as journeyService from "../services/journeyService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const startJourney = asyncHandler(async (req, res) => {
  const journey = await journeyService.startJourney({ user: req.user, routeId: req.body.routeId });
  if (!journey) return res.status(404).json({ error: "NotFound", message: "Route not found." });
  res.status(201).json({ journey });
});

export const getJourney = asyncHandler(async (req, res) => {
  const journey = await journeyService.getJourney({ id: req.params.id, userId: req.user.id });
  if (!journey) return res.status(404).json({ error: "NotFound" });
  res.json({ journey });
});

export const updateJourney = asyncHandler(async (req, res) => {
  const result = await journeyService.updateJourney({ id: req.params.id, userId: req.user.id, patch: req.body });
  if (!result) return res.status(404).json({ error: "NotFound" });
  res.json(result);
});

export const listMyJourneys = asyncHandler(async (req, res) => {
  res.json({ journeys: await journeyService.listUserJourneys(req.user.id) });
});
