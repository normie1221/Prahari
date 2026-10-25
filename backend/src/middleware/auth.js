/**
 * Authentication & Authorization
 * ==============================
 * Real auth is Clerk. The Node backend verifies the Clerk session token on
 * every protected request (via @clerk/express's clerkMiddleware, mounted in
 * server.js) and then syncs/loads the corresponding local `User` row so the
 * rest of the app can just use req.user like any normal DB-backed user.
 *
 * DEV FALLBACK (documented, controlled, off by default):
 * If AUTH_DEV_BYPASS=true (only ever meant for local development before you
 * have Clerk keys configured), requests are attached to a single fixed
 * development user instead of verifying a real session. This is hard-blocked
 * in production regardless of the env var, so it can never accidentally ship.
 */
import { getAuth } from "@clerk/express";
import { prisma } from "../config/prisma.js";
import { env, isProd } from "../config/env.js";

const DEV_USER = {
  clerkUserId: "dev_user_local",
  email: "dev@prahari.local",
  name: "Dev User",
};

async function loadOrCreateUser(clerkUserId, profile = {}) {
  try {
    return await prisma.user.upsert({
      where: { clerkUserId },
      update: { lastActivityAt: new Date() },
      create: {
        clerkUserId,
        email: profile.email || `${clerkUserId}@unknown.prahari.local`,
        name: profile.name || null,
        imageUrl: profile.imageUrl || null,
      },
    });
  } catch (err) {
    // Handles the extremely rare case of two upserts landing in the exact
    // same instant — read back the row the other request just created.
    if (err.code === "P2002") {
      return prisma.user.findUniqueOrThrow({ where: { clerkUserId } });
    }
    throw err;
  }
}

/** Requires a valid Clerk session. Attaches req.user (local DB user). */
export function requireAuthUser() {
  return async (req, res, next) => {
    try {
      if (env.authDevBypass && !isProd) {
        req.user = await loadOrCreateUser(DEV_USER.clerkUserId, DEV_USER);
        return next();
      }

      const auth = getAuth(req);
      if (!auth?.userId) {
        return res.status(401).json({ error: "Unauthorized", message: "Sign in required." });
      }
      req.user = await loadOrCreateUser(auth.userId);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Optional auth: attaches req.user if signed in, but does not block otherwise. */
export function optionalAuthUser() {
  return async (req, res, next) => {
    try {
      if (env.authDevBypass && !isProd) {
        req.user = await loadOrCreateUser(DEV_USER.clerkUserId, DEV_USER);
        return next();
      }
      const auth = getAuth(req);
      if (auth?.userId) {
        req.user = await loadOrCreateUser(auth.userId);
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Role-based authorization. Must run AFTER requireAuthUser(). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden", message: "You do not have permission to do this." });
    }
    return next();
  };
}

/**
 * Ownership guard: ensures the authenticated user owns the resource whose
 * owner-id is resolved by `getOwnerId(req)` — prevents a user from touching
 * another user's private data by manipulating an ID in the request path.
 * Admins/moderators bypass this check.
 */
export function requireOwnerOrRole(getOwnerId, ...bypassRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (bypassRoles.includes(req.user.role)) return next();
      const ownerId = await getOwnerId(req);
      if (ownerId && ownerId === req.user.id) return next();
      return res.status(403).json({ error: "Forbidden", message: "You can only access your own data." });
    } catch (err) {
      return next(err);
    }
  };
}
