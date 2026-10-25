import { PrismaClient } from "@prisma/client";

// Single shared Prisma client instance (recommended pattern to avoid
// exhausting Neon's connection pool with one client per request/module).
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
