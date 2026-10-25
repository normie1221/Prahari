import * as communityService from "../services/communityService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const listGroups = asyncHandler(async (req, res) => {
  res.json({ groups: await communityService.listGroups() });
});

export const createGroup = asyncHandler(async (req, res) => {
  const group = await communityService.createGroup({ user: req.user, ...req.body });
  res.status(201).json({ group });
});

export const joinGroup = asyncHandler(async (req, res) => {
  await communityService.joinGroup({ user: req.user, groupId: req.params.groupId });
  res.json({ joined: true });
});

export const listPosts = asyncHandler(async (req, res) => {
  const data = await communityService.listPosts({ groupId: req.params.groupId, ...req.query });
  res.json(data);
});

export const createPost = asyncHandler(async (req, res) => {
  const result = await communityService.createPost({ user: req.user, groupId: req.params.groupId, ...req.body });
  res.status(201).json(result);
});

export const getPost = asyncHandler(async (req, res) => {
  const post = await communityService.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: "NotFound" });
  res.json({ post });
});

export const createReply = asyncHandler(async (req, res) => {
  const reply = await communityService.createReply({ user: req.user, postId: req.params.id, content: req.body.content });
  if (!reply) return res.status(404).json({ error: "NotFound" });
  res.status(201).json({ reply });
});

export const upvotePost = asyncHandler(async (req, res) => {
  const post = await communityService.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: "NotFound" });
  const updated = await communityService.upvotePost({ postId: req.params.id, groupId: post.groupId });
  res.json({ post: updated });
});

export const reportPost = asyncHandler(async (req, res) => {
  const report = await communityService.reportPost({ user: req.user, postId: req.params.id, reason: req.body.reason });
  res.status(201).json({ report });
});

export const search = asyncHandler(async (req, res) => {
  const results = await communityService.searchCommunity(req.query.q || "");
  res.json({ results });
});
