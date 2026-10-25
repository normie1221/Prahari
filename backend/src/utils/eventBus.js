import { EventEmitter } from "node:events";

/** Decouples services (pure business logic) from Socket.IO (transport).
 * Services publish domain events here; src/sockets/index.js subscribes and
 * relays them to connected clients in real time. */
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export const Events = {
  POST_CREATED: "community.post.created",
  REPLY_CREATED: "community.reply.created",
  POST_UPVOTED: "community.post.upvoted",
  INCIDENT_CREATED: "safety.incident.created",
  JOURNEY_UPDATED: "journey.updated",
  SOS_TRIGGERED: "emergency.sos.triggered",
  ADMIN_STATS_CHANGED: "admin.stats.changed",
};
