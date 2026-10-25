import * as incidentService from "../services/incidentService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { eventBus, Events } from "../utils/eventBus.js";

export const uploadMedia = asyncHandler(async (req, res) => {
  const files = req.files || [];
  const urls = files.map((f) => `/uploads/incidents/${f.filename}`);
  res.status(201).json({ urls });
});

export const createIncident = asyncHandler(async (req, res) => {
  const incident = await incidentService.createIncident({ user: req.user, payload: req.body });
  eventBus.emit(Events.INCIDENT_CREATED, { incident });
  res.status(201).json({ incident });
});

export const listIncidents = asyncHandler(async (req, res) => {
  const data = await incidentService.listIncidents(req.query);
  res.json(data);
});

export const getIncident = asyncHandler(async (req, res) => {
  const incident = await incidentService.getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: "NotFound" });
  res.json({ incident });
});

export const getAreaConfidence = asyncHandler(async (req, res) => {
  const { lat, lon, radiusMeters } = req.query;
  const data = await incidentService.getAreaConfidence({
    lat: Number(lat),
    lon: Number(lon),
    ...(radiusMeters ? { radiusMeters: Number(radiusMeters) } : {}),
  });
  res.json(data);
});

export const updateIncidentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const incident = await incidentService.updateIncidentStatus({ id: req.params.id, status, moderatorId: req.user.id });
  res.json({ incident });
});
