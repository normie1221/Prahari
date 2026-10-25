/**
 * Notification Dispatch
 * ======================
 * Sends the actual SOS message to a user's emergency contacts. Two real
 * channels are wired in:
 *   - SMS via Twilio
 *   - Email via SMTP (nodemailer) — works with any provider (SendGrid,
 *     Postmark, SES, Gmail app password, etc.) since it's plain SMTP.
 *
 * DEV FALLBACK (documented, controlled): if Twilio/SMTP credentials are not
 * configured, sends are "simulated" — logged and recorded with
 * `simulated: true` instead of silently failing or pretending to succeed
 * indistinguishably from a real send. This mirrors the AUTH_DEV_BYPASS
 * pattern elsewhere in the codebase: safe to develop against, impossible to
 * mistake for a real delivery in production because both are logged and
 * surfaced back to the caller.
 *
 * Delivery is fire-and-forget from the caller's perspective but retried in
 * the background (see retryQueue.js) so a transient provider error doesn't
 * silently drop an emergency message.
 */
import twilio from "twilio";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { enqueueRetry } from "./retryQueue.js";

const smsConfigured = Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.fromNumber);
const emailConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);

const twilioClient = smsConfigured ? twilio(env.twilio.accountSid, env.twilio.authToken) : null;

const mailTransport = emailConfigured
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  : null;

function locationLink(lat, lon) {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

function buildSosMessage({ userName, latitude, longitude, message }) {
  const base = `PRAHARI SOS: ${userName || "A contact"} may need help. Location: ${locationLink(latitude, longitude)}`;
  return message ? `${base}\nMessage: ${message}` : base;
}

async function sendSms(toPhone, body) {
  if (!smsConfigured) {
    logger.warn({ toPhone }, "[notifications] SMS not configured (TWILIO_* env vars missing) — simulating send");
    return { channel: "sms", to: toPhone, status: "simulated", simulated: true };
  }
  const result = await twilioClient.messages.create({ to: toPhone, from: env.twilio.fromNumber, body });
  return { channel: "sms", to: toPhone, status: "sent", providerSid: result.sid, simulated: false };
}

async function sendEmail(toEmail, subject, text) {
  if (!emailConfigured) {
    logger.warn({ toEmail }, "[notifications] Email not configured (SMTP_* env vars missing) — simulating send");
    return { channel: "email", to: toEmail, status: "simulated", simulated: true };
  }
  const info = await mailTransport.sendMail({ from: env.smtp.from || env.smtp.user, to: toEmail, subject, text });
  return { channel: "email", to: toEmail, status: "sent", messageId: info.messageId, simulated: false };
}

/**
 * Notify one emergency contact across every channel we have for them
 * (SMS if they have a phone, email if they have one on file). Failures on
 * one channel don't block the other, and each failed attempt is queued for
 * background retry rather than silently dropped.
 */
export async function notifyContact(contact, { userName, latitude, longitude, message }) {
  const body = buildSosMessage({ userName, latitude, longitude, message });
  const results = [];

  if (contact.phone) {
    try {
      results.push(await sendSms(contact.phone, body));
    } catch (err) {
      logger.error({ err, contactId: contact.id }, "[notifications] SMS send failed — queuing retry");
      enqueueRetry({ type: "sms", contact, payload: { userName, latitude, longitude, message } });
      results.push({ channel: "sms", to: contact.phone, status: "queued_for_retry", simulated: false });
    }
  }

  if (contact.email) {
    try {
      results.push(await sendEmail(contact.email, "PRAHARI Emergency Alert", body));
    } catch (err) {
      logger.error({ err, contactId: contact.id }, "[notifications] Email send failed — queuing retry");
      enqueueRetry({ type: "email", contact, payload: { userName, latitude, longitude, message } });
      results.push({ channel: "email", to: contact.email, status: "queued_for_retry", simulated: false });
    }
  }
  if (contact.phone && contact.whatsappEnabled === true) {
  try {
    results.push(
      await sendWhatsApp(contact.phone, {
        userName,
        latitude,
        longitude,
        message,
      })
    );
  } catch (err) {
    logger.error(
      { err, contactId: contact.id },
      "[notifications] WhatsApp send failed"
    );

    enqueueRetry({
      type: "whatsapp",
      contact,
      payload: { userName, latitude, longitude, message },
    });

    results.push({
      channel: "whatsapp",
      to: contact.phone,
      status: "queued_for_retry",
      simulated: false,
    });
  }
}

  return results;
}

export function dispatchChannelStatus() {
  return { smsConfigured, emailConfigured };
}

const whatsappConfigured = Boolean(
  smsConfigured &&
  env.twilio.whatsappFrom &&
  env.twilio.whatsappContentSid
);

async function sendWhatsApp(toPhone, { userName, latitude, longitude, message }) {
  if (!whatsappConfigured) {
    logger.warn(
      { toPhone },
      "[notifications] WhatsApp not configured — simulating send"
    );

    return {
      channel: "whatsapp",
      to: toPhone,
      status: "simulated",
      simulated: true,
    };
  }

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Valid GPS coordinates are required for WhatsApp SOS.");
  }

  const mapsLink = locationLink(latitude, longitude);

  const contentVariables = JSON.stringify({
    "1": userName || "A contact",
    "2": mapsLink,
    "3": message || "Please contact them and arrange assistance.",
  });

  const result = await twilioClient.messages.create({
    from: env.twilio.whatsappFrom,
    to: toPhone.startsWith("whatsapp:")
      ? toPhone
      : `whatsapp:${toPhone}`,
    contentSid: env.twilio.whatsappContentSid,
    contentVariables,
  });

  return {
    channel: "whatsapp",
    to: toPhone,
    status: "sent",
    providerSid: result.sid,
    simulated: false,
  };
}

// Exposed for retryQueue.js so a retried attempt uses the exact same send
// path as the original attempt.
export const _internal = { sendSms, sendEmail, buildSosMessage , sendWhatsApp, whatsappConfigured };
