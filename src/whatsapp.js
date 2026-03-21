const twilio = require("twilio");

let twilioClient;

function getClient() {
  if (!twilioClient) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return twilioClient;
}

/**
 * Send a WhatsApp message via Twilio.
 * @param {string} to      - Recipient in format "whatsapp:+1234567890"
 * @param {string} body    - Message text
 */
async function sendMessage(to, body) {
  return getClient().messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to,
    body,
  });
}

module.exports = { sendMessage };
