const twilio = require("twilio");

let client;

function getTwilioClient() {
  if (client) return client;

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are missing.");
  }

  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return client;
}

async function sendWhatsAppSOS({
  recipient,
  latitude,
  longitude,
  userName,
}) {
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
    throw new Error("Valid GPS coordinates are required.");
  }

  if (!recipient) {
    throw new Error("Emergency contact WhatsApp number is required.");
  }

  const sender = process.env.TWILIO_WHATSAPP_FROM;

  if (!sender) {
    throw new Error("TWILIO_WHATSAPP_FROM is missing.");
  }

  const mapsLink =
    `https://www.google.com/maps?q=${latitude},${longitude}`;

  const messageBody = [
    "🚨 PRAHARI EMERGENCY SOS 🚨",
    "",
    `${userName || "Someone"} needs immediate help.`,
    "Please contact them and arrange assistance.",
    "",
    "📍 CURRENT REPORTED LOCATION:",
    mapsLink,
    "",
    `Coordinates: ${latitude}, ${longitude}`,
    `Time: ${new Date().toISOString()}`,
    "",
    "This is an emergency alert from PRAHARI.",
  ].join("\n");

  // Free-form messages require an open WhatsApp
  // customer-service window for the recipient.
  const message = await getTwilioClient().messages.create({
    from: sender,
    to: recipient.startsWith("whatsapp:")
      ? recipient
      : `whatsapp:${recipient}`,
    body: messageBody,
  });

  return {
    sid: message.sid,
    status: message.status,
    mapsLink,
  };
}

module.exports = { sendWhatsAppSOS };