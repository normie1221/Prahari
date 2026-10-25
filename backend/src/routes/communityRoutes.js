import { Router } from "express";
import { requireAuthUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { authedWriteLimiter } from "../middleware/rateLimiter.js";
import { perUserLimiter } from "../middleware/perUserLimiter.js";
import { env } from "../config/env.js";
import {
  createGroupSchema, createPostSchema, createReplySchema, reportPostSchema, listPostsQuerySchema,
} from "../validators/communityValidators.js";
import * as ctrl from "../controllers/communityController.js";

const router = Router();

const postLimiter = perUserLimiter({ windowMs: env.perUserPostWindowMs, max: env.perUserPostMax, action: "post" });

router.get("/groups", ctrl.listGroups);
router.post("/groups", requireAuthUser(), validate(createGroupSchema), ctrl.createGroup);
router.post("/groups/:groupId/join", requireAuthUser(), ctrl.joinGroup);

router.get("/groups/:groupId/posts", validate(listPostsQuerySchema, "query"), ctrl.listPosts);
router.post(
  "/groups/:groupId/posts",
  requireAuthUser(),
  authedWriteLimiter,
  postLimiter,
  validate(createPostSchema),
  ctrl.createPost,
);

router.get("/posts/:id", ctrl.getPost);
router.post("/posts/:id/replies", requireAuthUser(), authedWriteLimiter, validate(createReplySchema), ctrl.createReply);
router.post("/posts/:id/upvote", requireAuthUser(), ctrl.upvotePost);
router.post("/posts/:id/report", requireAuthUser(), validate(reportPostSchema), ctrl.reportPost);

router.get("/search", ctrl.search);

export default router;
