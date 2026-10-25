import * as adminService from "../services/adminService.js";
import * as incidentService from "../services/incidentService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const getStats = asyncHandler(async (req, res) => {
  res.json(await adminService.getSafetyStats());
});

export const getTrends = asyncHandler(async (req, res) => {
  res.json(await adminService.getIncidentTrends({ days: Number(req.query.days || 30) }));
});

export const getPendingReports = asyncHandler(async (req, res) => {
  res.json(await adminService.listPendingReports(req.query));
});

export const getFlaggedPosts = asyncHandler(async (req, res) => {
  res.json(await adminService.listFlaggedPosts(req.query));
});

export const updateReportStatus = asyncHandler(async (req, res) => {
  const incident = await incidentService.updateIncidentStatus({
    id: req.params.id, status: req.body.status, moderatorId: req.user.id,
  });
  res.json({ incident });
});
