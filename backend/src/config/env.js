import "dotenv/config";

function warnIfMissing(name) {
  if (!process.env[name]) {
    // eslint-disable-next-line no-console
    console.warn(`[config] Missing env var ${name} — some features may not work until it is set.`);
  }
  return process.env[name];
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",

  databaseUrl: warnIfMissing("DATABASE_URL"),

  clerkSecretKey: warnIfMissing("CLERK_SECRET_KEY"),
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  authDevBypass: process.env.AUTH_DEV_BYPASS === "true",

  // Place search (see integrations/geocoderClient.js)
  photonUrl: process.env.PHOTON_URL || "https://photon.komoot.io",
  nominatimUrl: process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
  geocoderUserAgent: process.env.GEOCODER_USER_AGENT || "PRAHARI-safety-navigation/1.0 (local development)",
  geocoderMinIntervalMs: Number(process.env.GEOCODER_MIN_INTERVAL_MS || 1000),

  navigationServiceUrl: process.env.NAVIGATION_SERVICE_URL || "http://localhost:8000",
  navigationServiceToken: process.env.NAVIGATION_SERVICE_TOKEN || "",

  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),

  // Per-user (not just per-IP) write limits — see middleware/perUserLimiter.js
  perUserIncidentWindowMs: Number(process.env.PER_USER_INCIDENT_WINDOW_MS || 10 * 60 * 1000),
  perUserIncidentMax: Number(process.env.PER_USER_INCIDENT_MAX || 5),
  perUserPostWindowMs: Number(process.env.PER_USER_POST_WINDOW_MS || 10 * 60 * 1000),
  perUserPostMax: Number(process.env.PER_USER_POST_MAX || 10),

  twilio: {
  accountSid: process.env.TWILIO_ACCOUNT_SID || "",
  authToken: process.env.TWILIO_AUTH_TOKEN || "",
  fromNumber: process.env.TWILIO_FROM_NUMBER || "",
  whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "",
  whatsappContentSid: process.env.TWILIO_WHATSAPP_CONTENT_SID || "",
},
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "",
  },
};

export const isProd = env.nodeEnv === "production";
