import pino from "pino";
import { isProd } from "./env.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  transport: isProd
    ? undefined // production: structured JSON to stdout, for log aggregation
    : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
});
