require("dotenv").config();
const twilio = require("twilio");

async function main() {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const message = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: "whatsapp:+917643023554",
    contentSid: "HX8dc9eea84231541b091557c47cc2a342"
  });

  console.log("Message SID:", message.sid);
  console.log("Initial status:", message.status);
}

main().catch((err) => {
  console.error("WhatsApp test failed:", err.message);
  if (err.code) console.error("Twilio error code:", err.code);
  process.exitCode = 1;
});