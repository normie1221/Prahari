import { prisma } from "../config/prisma.js";
import { classifyText, findDuplicates } from "../ai/moderation.js";
import { eventBus, Events } from "../utils/eventBus.js";

export async function listGroups() {
  return prisma.discussionGroup.findMany({
    include: { _count: { select: { members: true, posts: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createGroup({ user, name, description }) {
  const group = await prisma.discussionGroup.create({
    data: { name, description, createdBy: user.id, members: { create: { userId: user.id } } },
  });
  return group;
}

export async function joinGroup({ user, groupId }) {
  return prisma.discussionMember.upsert({
    where: { groupId_userId: { groupId, userId: user.id } },
    update: {},
    create: { groupId, userId: user.id },
  });
}

export async function listPosts({ groupId, page, pageSize, q }) {
  const where = { groupId, ...(q ? { content: { contains: q, mode: "insensitive" } } : {}) };
  const [items, total] = await Promise.all([
    prisma.discussionPost.findMany({
      where,
      include: { user: { select: { id: true, name: true, imageUrl: true } }, _count: { select: { replies: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discussionPost.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function createPost({ user, groupId, content, latitude, longitude, locationLabel, category }) {
  const recent = await prisma.discussionPost.findMany({
    where: { groupId, createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) } },
    select: { id: true, content: true },
    take: 100,
  });

  const moderation = classifyText(content);
  const duplicates = findDuplicates(content, recent);
  const isFlagged = moderation.needsModeratorReview || duplicates.length > 0;

  const post = await prisma.discussionPost.create({
    data: {
      groupId,
      userId: user.id,
      content,
      latitude,
      longitude,
      locationLabel,
      category: category || moderation.suggestedCategories[0] || null,
      isFlagged,
    },
    include: { user: { select: { id: true, name: true, imageUrl: true } } },
  });

  eventBus.emit(Events.POST_CREATED, { groupId, post, moderation });
  return { post, moderation, duplicates };
}

export async function getPostById(id) {
  return prisma.discussionPost.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, imageUrl: true } },
      replies: {
        include: { user: { select: { id: true, name: true, imageUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
      group: true,
    },
  });
}

export async function createReply({ user, postId, content }) {
  const post = await prisma.discussionPost.findUnique({ where: { id: postId }, select: { groupId: true } });
  if (!post) return null;

  const reply = await prisma.discussionReply.create({
    data: { postId, userId: user.id, content },
    include: { user: { select: { id: true, name: true, imageUrl: true } } },
  });

  eventBus.emit(Events.REPLY_CREATED, { groupId: post.groupId, postId, reply });
  return reply;
}

export async function upvotePost({ postId, groupId }) {
  const post = await prisma.discussionPost.update({
    where: { id: postId },
    data: { upvoteCount: { increment: 1 } },
  });
  eventBus.emit(Events.POST_UPVOTED, { groupId, postId, upvoteCount: post.upvoteCount });
  return post;
}

export async function reportPost({ user, postId, reason }) {
  const report = await prisma.report.create({
    data: { postId, reportedBy: user.id, reason },
  });
  await prisma.discussionPost.update({ where: { id: postId }, data: { isFlagged: true } });
  return report;
}

export async function searchCommunity(q) {
  const posts = await prisma.discussionPost.findMany({
    where: { content: { contains: q, mode: "insensitive" } },
    include: { group: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return posts;
}
