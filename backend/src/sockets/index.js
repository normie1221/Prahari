/**
 * Real-time layer (Socket.IO)
 * ===========================
 * Relays domain events (published on the shared eventBus by services) to
 * connected clients. Rooms:
 *   - `group:<groupId>`   -> community forum live posts/replies/upvotes
 *   - `journey:<userId>`  -> live journey/alert updates for that user
 *   - `admin`             -> live dashboard stat changes (admins only)
 *
 * Auth: the client sends its Clerk session token on connection; we verify
 * it the same way HTTP requests are verified, then join the socket to the
 * rooms it's entitled to.
 */
import { verifyToken } from "@clerk/express";
import { prisma } from "../config/prisma.js";
import { env, isProd } from "../config/env.js";
import { eventBus, Events } from "../utils/eventBus.js";

async function authenticateSocket(socket) {
  const token = socket.handshake.auth?.token;

  if (env.authDevBypass && !isProd) {
    return prisma.user.upsert({
      where: { clerkUserId: "dev_user_local" },
      update: {},
      create: { clerkUserId: "dev_user_local", email: "dev@prahari.local", name: "Dev User" },
    });
  }

  if (!token) return null;
  try {
    const payload = await verifyToken(token, { secretKey: env.clerkSecretKey });
    return prisma.user.findUnique({ where: { clerkUserId: payload.sub } });
  } catch {
    return null;
  }
}

export function attachSockets(io) {
  io.on("connection", async (socket) => {
    const user = await authenticateSocket(socket);
    if (user) {
      socket.data.user = user;
      socket.join(`journey:${user.id}`);
      if (["ADMIN", "MODERATOR"].includes(user.role)) socket.join("admin");
    }

    socket.on("group:join", (groupId) => {
      if (typeof groupId === "string") socket.join(`group:${groupId}`);
    });
    socket.on("group:leave", (groupId) => {
      if (typeof groupId === "string") socket.leave(`group:${groupId}`);
    });

    // Lightweight typing indicator for the discussion/chat UI.
    socket.on("group:typing", ({ groupId, userName }) => {
      if (groupId) socket.to(`group:${groupId}`).emit("group:typing", { userName });
    });
  });

  eventBus.on(Events.POST_CREATED, ({ groupId, post }) => {
    io.to(`group:${groupId}`).emit("post:created", post);
  });

  eventBus.on(Events.REPLY_CREATED, ({ groupId, postId, reply }) => {
    io.to(`group:${groupId}`).emit("reply:created", { postId, reply });
  });

  eventBus.on(Events.POST_UPVOTED, ({ groupId, postId, upvoteCount }) => {
    io.to(`group:${groupId}`).emit("post:upvoted", { postId, upvoteCount });
  });

  eventBus.on(Events.INCIDENT_CREATED, ({ incident }) => {
    io.to("admin").emit("incident:created", incident);
  });

  eventBus.on(Events.JOURNEY_UPDATED, ({ userId, journey, newAlert }) => {
    io.to(`journey:${userId}`).emit("journey:updated", { journey, newAlert });
  });

  eventBus.on(Events.SOS_TRIGGERED, ({ user, event, isSilent }) => {
    io.to("admin").emit("sos:triggered", { userId: user.id, userName: user.name, event, isSilent });
  });
}
