const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

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
- Keep reminderText short (max 15 words), imperative, e.g. "Call Mom", "Buy milk", "Take medication"
- Works with any language including Hebrew`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(raw);
    if (parsed.action === "remind") {
      const remindAt = new Date(parsed.remindAt);
      if (isNaN(remindAt.getTime())) {
        return { error: "לא הצלחתי להבין מתי לתזכר אותך. תנסה שוב?" };
      }
      if (remindAt <= now) {
        return { error: "הזמן הזה כבר עבר. תן לי זמן עתידי!" };
      }
      return { action: "remind", remindAt, reminderText: parsed.reminderText };
    }
    return parsed;
  } catch {
    return { error: "לא הבנתי. נסה משהו כמו: 'תזכיר לי לקרוא לאמא בעוד שעתיים'" };
  }
}

module.exports = { parseReminderRequest };
