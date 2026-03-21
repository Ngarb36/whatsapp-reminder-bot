/**
 * Simple rule-based reminder parser — no AI, no API, always free.
 * Supports Hebrew and English.
 */

function parseReminderRequest(userMessage, timezone) {
  const msg = userMessage.trim();
  const msgLower = msg.toLowerCase();

  // List reminders
  if (/^(list|רשימה|תראה|הצג)/.test(msgLower)) {
    return { action: "list" };
  }

  // Cancel
  if (/^(cancel|בטל|מחק)/.test(msgLower)) {
    return { action: "cancel" };
  }

  const reminderText = extractReminderText(msg);
  const remindAt = parseTime(msgLower, timezone);

  if (!remindAt) {
    return {
      error:
        "לא הבנתי מתי. נסה לכתוב:\n• \"תזכיר לי להתקלח בעוד שעה\"\n• \"תזכיר לי מחר ב-9:00 לקנות חלב\"\n• \"remind me to drink water in 30 minutes\"",
    };
  }

  if (remindAt <= new Date()) {
    return { error: "הזמן הזה כבר עבר. תן לי זמן עתידי!" };
  }

  return { action: "remind", remindAt, reminderText: reminderText || msg };
}

function extractReminderText(msg) {
  let m;

  // Hebrew: "תזכיר לי <text> בעוד/מחר/היום/..."
  // Capture everything after "לי " until a time keyword
  m = msg.match(/תזכיר לי (.+?)(?:\s+(?:בעוד|מחר|היום|הלילה|בשעה)|\s+ב-\d|$)/i);
  if (m && m[1].trim()) return m[1].trim();

  // English: "remind me to <text> in/at/tomorrow..."
  m = msg.match(/remind me (?:to )?(.+?)(?:\s+(?:in |at |tomorrow|tonight|today)|$)/i);
  if (m && m[1].trim()) return m[1].trim();

  return msg;
}

function parseTime(msg, timezone) {
  const now = new Date();

  // "in X minutes" / "בעוד X דקות"
  let m = msg.match(/(?:in|בעוד)\s+(\d+)\s*(?:minutes?|דקות?|דק'?)/);
  if (m) return addMinutes(now, parseInt(m[1]));

  // "in X hours" / "בעוד X שעות"
  m = msg.match(/(?:in|בעוד)\s+(\d+)\s*(?:hours?|שעות?|שעה)/);
  if (m) return addMinutes(now, parseInt(m[1]) * 60);

  // "in X days" / "בעוד X ימים"
  m = msg.match(/(?:in|בעוד)\s+(\d+)\s*(?:days?|ימים?|יום)/);
  if (m) return addMinutes(now, parseInt(m[1]) * 60 * 24);

  // "tomorrow at HH:MM" / "מחר ב-HH:MM" / "מחר בשעה HH"
  m = msg.match(/(?:tomorrow|מחר)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    return zonedDate(1, hour, minute, timezone);
  }

  // "tonight at H" / "הלילה ב-H"
  m = msg.match(/(?:tonight|הלילה)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    let hour = parseInt(m[1]);
    if (hour < 12) hour += 12;
    const minute = parseInt(m[2] || "0");
    return zonedDate(0, hour, minute, timezone);
  }

  // "today at HH:MM" / "היום ב-HH:MM" / "היום בשעה HH"
  m = msg.match(/(?:today|היום)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    const t = zonedDate(0, hour, minute, timezone);
    if (t > now) return t;
    return zonedDate(1, hour, minute, timezone);
  }

  // "ב-HH:MM" standalone
  m = msg.match(/ב-(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    const t = zonedDate(0, hour, minute, timezone);
    if (t > now) return t;
    return zonedDate(1, hour, minute, timezone);
  }

  // "at HH:MM"
  m = msg.match(/at\s+(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    let hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    if (hour <= 7) hour += 12;
    const t = zonedDate(0, hour, minute, timezone);
    if (t > now) return t;
    return zonedDate(1, hour, minute, timezone);
  }

  return null;
}

/**
 * Returns a Date representing daysFromNow days from now at hour:minute in the given timezone.
 */
function zonedDate(daysFromNow, hour, minute, timezone) {
  const base = new Date(Date.now() + daysFromNow * 86400000);
  const dateStr = base.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD

  // Create naive UTC date at the specified hour/minute
  const naive = new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00Z`);

  // Calculate timezone offset at that moment
  const utcRepr = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzRepr = new Date(naive.toLocaleString("en-US", { timeZone: timezone }));
  const offsetMs = tzRepr - utcRepr;

  return new Date(naive.getTime() - offsetMs);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

module.exports = { parseReminderRequest };
