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

async function sendReminderWithButtons(to, reminderText) {
  const contentSid = process.env.TWILIO_REMINDER_CONTENT_SID;
  if (!contentSid) return sendMessage(to, `⏰ תזכורת: ${reminderText}`);

  return getClient().messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to,
    contentSid,
    contentVariables: JSON.stringify({ 1: reminderText }),
    messagingServiceSid: undefined,
  });
}

module.exports = { sendMessage, sendReminderWithButtons };
