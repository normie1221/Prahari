import { asyncHandler } from "../middleware/errorHandler.js";

/** Returns the current authenticated user's own profile — used by the
 * frontend to decide what to show (e.g. only render the Admin nav link,
 * or attempt admin API calls, for users who actually have that role)
 * without ever guessing or hard-coding role logic client-side. */
export const getMe = asyncHandler(async (req, res) => {
  const { id, name, email, role, imageUrl, createdAt } = req.user;
  res.json({ user: { id, name, email, role, imageUrl, createdAt } });
});
