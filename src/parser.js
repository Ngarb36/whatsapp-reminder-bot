/**
 * Simple rule-based reminder parser — no AI, no API, always free.
 * Supports Hebrew and English.
 */

function parseReminderRequest(userMessage, timezone) {
  const msg = userMessage.trim().toLowerCase();

  // List reminders
  if (/^(list|רשימה|תראה|הצג)/.test(msg)) {
    return { action: "list" };
  }

  // Cancel
  if (/^(cancel|בטל|מחק)/.test(msg)) {
    return { action: "cancel" };
  }

  // Extract reminder text — everything after "to/ל/את" keyword
  let reminderText = extractReminderText(userMessage);

  // Parse time
  const remindAt = parseTime(msg, timezone);

  if (!remindAt) {
    return {
      error:
        "לא הבנתי מתי. נסה לכתוב:\n• \"תזכיר לי לקרוא לאמא בעוד שעה\"\n• \"remind me to drink water in 30 minutes\"\n• \"תזכיר לי מחר ב-9:00 לקנות חלב\"",
    };
  }

  if (remindAt <= new Date()) {
    return { error: "הזמן הזה כבר עבר. תן לי זמן עתידי!" };
  }

  return { action: "remind", remindAt, reminderText: reminderText || userMessage };
}

function extractReminderText(msg) {
  // Hebrew: after "ל" or "את"
  let m = msg.match(/תזכיר לי ל(.+?)(?:בעוד|ב-|מחר|היום|הלילה|בשעה|$)/i);
  if (m) return m[1].trim();

  m = msg.match(/תזכיר לי את (.+?)(?:בעוד|ב-|מחר|היום|הלילה|בשעה|$)/i);
  if (m) return m[1].trim();

  // English: after "to"
  m = msg.match(/remind me to (.+?)(?:in |at |tomorrow|tonight|today|$)/i);
  if (m) return m[1].trim();

  return msg;
}

function parseTime(msg, timezone) {
  const now = new Date();

  // "in X minutes"
  let m = msg.match(/(?:in|בעוד)\s+(\d+)\s*(?:minutes?|minute|דקות?|דק)/i);
  if (m) return addMinutes(now, parseInt(m[1]));

  // "in X hours"
  m = msg.match(/(?:in|בעוד)\s+(\d+)\s*(?:hours?|hour|שעות?|שעה)/i);
  if (m) return addMinutes(now, parseInt(m[1]) * 60);

  // "in X days"
  m = msg.match(/(?:in|בעוד)\s+(\d+)\s*(?:days?|day|ימים?|יום)/i);
  if (m) return addMinutes(now, parseInt(m[1]) * 60 * 24);

  // "tomorrow at HH:MM" or "מחר ב-HH:MM"
  m = msg.match(/(?:tomorrow|מחר).*?(\d{1,2})(?::(\d{2}))?/i);
  if (m) {
    const hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    return tomorrowAt(hour, minute, timezone);
  }

  // "tonight at H" / "הלילה ב-H"
  m = msg.match(/(?:tonight|הלילה).*?(\d{1,2})(?::(\d{2}))?/i);
  if (m) {
    const hour = parseInt(m[1]) < 12 ? parseInt(m[1]) + 12 : parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    return todayAt(hour, minute, timezone);
  }

  // "today at HH:MM" / "היום ב-HH:MM" / "ב-HH:MM"
  m = msg.match(/(?:today|היום|ב-)(\d{1,2})(?::(\d{2}))?/i);
  if (m) {
    const hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    return todayAt(hour, minute, timezone);
  }

  // "at HH:MM"
  m = msg.match(/(?:at|בשעה)\s*(\d{1,2})(?::(\d{2}))?/i);
  if (m) {
    let hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    if (hour <= 7) hour += 12; // assume PM if ambiguous
    const t = todayAt(hour, minute, timezone);
    if (t > now) return t;
    return tomorrowAt(hour, minute, timezone);
  }

  return null;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function todayAt(hour, minute, timezone) {
  const now = new Date();
  const str = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  return new Date(`${str}T${pad(hour)}:${pad(minute)}:00`);
}

function tomorrowAt(hour, minute, timezone) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const str = tomorrow.toLocaleDateString("en-CA", { timeZone: timezone });
  return new Date(`${str}T${pad(hour)}:${pad(minute)}:00`);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

module.exports = { parseReminderRequest };
