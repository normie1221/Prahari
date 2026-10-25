import * as navigationService from "../services/navigationService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const computeRoute = asyncHandler(async (req, res) => {
  const { origin, destination, mode, originLabel, destLabel } = req.body;
  const result = await navigationService.getRoutes({ user: req.user, origin, destination, mode, originLabel, destLabel });
  if (result.building) return res.status(202).json(result);
  res.json(result);
});

export const recalculateRoute = asyncHandler(async (req, res) => {
  const result = await navigationService.recalculateRoute({ user: req.user, routeId: req.params.routeId });
  if (!result) return res.status(404).json({ error: "NotFound", message: "Route not found." });
  res.json(result);
});

export const getHeatmap = asyncHandler(async (req, res) => {
  const data = await navigationService.getHeatmap(req.query);
  res.json(data);
});

export const getMyRoutes = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const data = await navigationService.getSavedRoutesForUser(req.user.id, { page, pageSize });
  res.json(data);
});
