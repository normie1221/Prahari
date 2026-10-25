import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(1000).optional(),
});

export const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationLabel: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
});

export const createReplySchema = z.object({
  content: z.string().min(1).max(3000),
});

export const reportPostSchema = z.object({
  reason: z.string().min(3).max(500),
});

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().max(200).optional(),
});
