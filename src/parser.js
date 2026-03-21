const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Parses a natural language reminder request.
 * Returns { remindAt: Date, reminderText: string } or { error: string }.
 *
 * @param {string} userMessage  - Raw message from the user
 * @param {string} timezone     - IANA timezone string (e.g. "America/New_York")
 */
async function parseReminderRequest(userMessage, timezone) {
  const now = new Date();
  const nowISO = now.toISOString();

  const prompt = `You are a reminder parsing assistant. The current date/time is ${nowISO} (UTC).
The user's local timezone is: ${timezone}.

The user sent this message: "${userMessage}"

Determine if this is a request to set a reminder. If it is, extract:
1. The exact UTC datetime to send the reminder (ISO 8601 format)
2. The reminder text (what to remind them about, in a friendly short phrase)

If the user is asking to LIST their reminders, respond with action "list".
If the user is asking to CANCEL or delete reminders, respond with action "cancel".
If the message is not a reminder request at all, respond with action "unknown".

Respond ONLY with a valid JSON object in one of these shapes:

For a reminder:
{"action":"remind","remindAt":"2024-03-15T14:00:00.000Z","reminderText":"Call Mom"}

For listing:
{"action":"list"}

For cancellation:
{"action":"cancel"}

For unrecognised input:
{"action":"unknown","hint":"brief friendly explanation of what you understood"}

Rules:
- "in 2 hours" means now + 2 hours
- "tomorrow at 10am" means next calendar day at 10:00 in the user's timezone, converted to UTC
- "tonight at 8" means today at 20:00 in the user's timezone
- If no AM/PM is given and the hour is <= 7, assume PM (e.g. "at 7" → 19:00)
- Never return a remindAt in the past
- Keep reminderText short (max 15 words), imperative, e.g. "Call Mom", "Buy milk", "Take medication"`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].text.trim();

  try {
    const parsed = JSON.parse(raw);
    if (parsed.action === "remind") {
      const remindAt = new Date(parsed.remindAt);
      if (isNaN(remindAt.getTime())) {
        return { error: "I couldn't figure out when to remind you. Could you be more specific?" };
      }
      if (remindAt <= now) {
        return { error: "That time is already in the past. Please give me a future time!" };
      }
      return { action: "remind", remindAt, reminderText: parsed.reminderText };
    }
    return parsed; // list / cancel / unknown
  } catch {
    return { error: "I had trouble understanding that. Try something like: 'Remind me to call Mom in 2 hours'." };
  }
}

module.exports = { parseReminderRequest };
