require("dotenv").config();

const express = require("express");
const server = require("./server");
const scheduler = require("./scheduler");

const PORT = process.env.PORT || 3000;

// Validate required env vars on startup
const required = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_NUMBER",
  "GOOGLE_API_KEY",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error("Missing required environment variables:", missing.join(", "));
  console.error("Copy .env.example to .env and fill in your credentials.");
  process.exit(1);
}

const app = express();
app.use(server);

app.listen(PORT, () => {
  console.log(`[server] WhatsApp reminder bot listening on port ${PORT}`);
  console.log(`[server] Webhook URL: http://YOUR_DOMAIN:${PORT}/webhook`);
});

scheduler.start();
