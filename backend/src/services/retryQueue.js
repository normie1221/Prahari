/**
 * Retry Queue (notifications)
 * ============================
 * A minimal in-process, in-memory retry queue for failed SOS notification
 * sends. This is intentionally simple — it exists so a transient Twilio/SMTP
 * error during an emergency doesn't just vanish, without pulling in a full
 * job-queue dependency (Redis/BullMQ) for a single use case.
 *
 * PRODUCTION NOTE: this queue lives in process memory and is lost on
 * restart/crash. For a production deployment handling real emergencies at
 * scale, swap this for a durable queue (BullMQ + Redis, or a cloud queue
 * like SQS) using the same `enqueueRetry`/handler shape — nothing in
 * notificationService.js needs to change to make that swap.
 */
import { logger } from "../config/logger.js";

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 3000;

const pending = [];
let timerHandle = null;

function scheduleNext() {
  if (timerHandle || pending.length === 0) return;
  const job = pending[0];
  const delay = BASE_DELAY_MS * 2 ** job.attempts;
  timerHandle = setTimeout(async () => {
    timerHandle = null;
    pending.shift();
    await runJob(job);
    scheduleNext();
  }, delay);
}

async function runJob(job) {
  // Lazy import avoids a circular dependency with notificationService.js.
  const { _internal } = await import("./notificationService.js");
  job.attempts += 1;
  try {
    if (job.type === "sms") {
      await _internal.sendSms(job.contact.phone, _internal.buildSosMessage(job.payload));
    } else {
      await _internal.sendEmail(job.contact.email, "PRAHARI Emergency Alert", _internal.buildSosMessage(job.payload));
    }
    logger.info({ type: job.type, contactId: job.contact.id, attempts: job.attempts }, "[retryQueue] retry succeeded");
  } catch (err) {
    if (job.attempts >= MAX_ATTEMPTS) {
      logger.error({ err, type: job.type, contactId: job.contact.id }, "[retryQueue] giving up after max attempts");
    } else {
      logger.warn({ type: job.type, contactId: job.contact.id, attempts: job.attempts }, "[retryQueue] retry failed, re-queuing");
      pending.push(job);
    }
  }
}

export function enqueueRetry({ type, contact, payload }) {
  pending.push({ type, contact, payload, attempts: 0 });
  scheduleNext();
}

export function _pendingCountForTests() {
  return pending.length;
}
