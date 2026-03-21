require("dotenv").config();

const express = require("express");
const server = require("./server");
const scheduler = require("./scheduler");
const { init } = require("./db");

const PORT = process.env.PORT || 3000;

const required = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_NUMBER",
  "DATABASE_URL",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error("Missing required environment variables:", missing.join(", "));
  process.exit(1);
}

async function start() {
  await init();
  console.log("[db] Database ready.");

  const app = express();
  app.use(server);

  app.listen(PORT, () => {
    console.log(`[server] WhatsApp reminder bot listening on port ${PORT}`);
  });

  scheduler.start();
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
