import express from "express";
import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { attachSockets } from "./sockets/index.js";
import * as navClient from "./integrations/navigationServiceClient.js";

import navigationRoutes from "./routes/navigationRoutes.js";
import incidentRoutes from "./routes/incidentRoutes.js";
import communityRoutes from "./routes/communityRoutes.js";
import journeyRoutes from "./routes/journeyRoutes.js";
import emergencyRoutes from "./routes/emergencyRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import geoRoutes from "./routes/geoRoutes.js";

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: env.frontendOrigin, credentials: true },
});

// -- Security & platform middleware -----------------------------------------
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/health" },
    customLogLevel: (req, res, err) => (res.statusCode >= 500 || err ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  }),
);
app.use(generalLimiter);
app.use("/uploads", express.static("uploads"));

// Clerk attaches req.auth for every request; individual routes decide
// whether auth is required via requireAuthUser()/optionalAuthUser().
app.use(clerkMiddleware());

// -- Health -------------------------------------------------------------------
app.get("/health", async (req, res) => {
  const [dbOk, navHealth] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    navClient.checkHealth(),
  ]);
  res.json({
    status: "ok",
    database: dbOk ? "connected" : "unreachable",
    navigationService: navHealth.status,
  });
});

// -- API routes ---------------------------------------------------------------
app.use("/api/navigation", navigationRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/journeys", journeyRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/geo", geoRoutes);
app.use("/api", userRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

attachSockets(io);

httpServer.listen(env.port, () => {
  logger.info(`prahari-backend listening on :${env.port} (${env.nodeEnv})`);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});
