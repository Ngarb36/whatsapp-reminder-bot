/**
 * Rule-based reminder parser — Hebrew & English, no AI needed.
 */

const HE_DAYS = {
  ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6,
};
const EN_DAYS = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function parseReminderRequest(userMessage, timezone) {
  const msg = userMessage.trim();
  const msgLower = msg.toLowerCase();

  // List
  if (/^(list|רשימה|תראה|הצג)/.test(msgLower)) return { action: "list" };

  // Delete by number: "מחק 2" / "delete 2"
  let m = msgLower.match(/^(?:מחק|בטל|delete|cancel)\s+(\d+)$/);
  if (m) return { action: "delete", index: parseInt(m[1]) };

  // Edit: "ערוך 1 ב-10:00" or "ערוך 1 לשתות מים"
  m = msg.match(/^(?:ערוך|edit)\s+(\d+)\s+(.+)$/i);
  if (m) return { action: "edit", index: parseInt(m[1]), newValue: m[2].trim() };

  // Generic cancel (no number)
  if (/^(?:מחק|בטל|delete|cancel)$/.test(msgLower)) return { action: "cancel_help" };

  // --- Recurring ---
  const recurring = parseRecurring(msgLower, timezone);
  if (recurring) {
    const reminderText = extractReminderText(msg);
    return { action: "remind", remindAt: recurring.remindAt, reminderText, recurrence: recurring.recurrence };
  }

  // --- One-time ---
  const reminderText = extractReminderText(msg);
  const remindAt = parseTime(msgLower, timezone);

  if (!remindAt) {
    return {
      error:
        "לא הבנתי מתי.\n\nדוגמאות:\n• \"תזכיר לי להתקלח בעוד שעה\"\n• \"תזכיר לי מחר ב-9:00 לקנות חלב\"\n• \"תזכיר לי כל יום שלישי ב-20:00 לצלצל לאמא\"\n• \"list\" — לראות את כל התזכורות",
    };
  }

  if (remindAt <= new Date()) return { error: "הזמן הזה כבר עבר. תן לי זמן עתידי!" };

  return { action: "remind", remindAt, reminderText, recurrence: null };
}

// ── Recurring ────────────────────────────────────────────────────────────────

function parseRecurring(msg, timezone) {
  // "כל יום ב-HH:MM" / "every day at HH:MM"
  let m = msg.match(/(?:כל יום|every day)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const hour = parseInt(m[1]);
    const minute = parseInt(m[2] || "0");
    const recurrence = `daily:${pad(hour)}:${pad(minute)}`;
    return { remindAt: nextDailyOccurrence(hour, minute, timezone), recurrence };
  }

  // "כל <יום בשבוע> ב-HH:MM" / "every <weekday> at HH:MM"
  for (const [name, dayNum] of Object.entries(HE_DAYS)) {
    const re = new RegExp(`כל\\s+${name}[\\s\\S]*?(\\d{1,2})(?::(\\d{2}))?`);
    m = msg.match(re);
    if (m) {
      const hour = parseInt(m[1]);
      const minute = parseInt(m[2] || "0");
      const recurrence = `weekly:${dayNum}:${pad(hour)}:${pad(minute)}`;
      return { remindAt: nextWeeklyOccurrence(dayNum, hour, minute, timezone), recurrence };
    }
  }
  for (const [name, dayNum] of Object.entries(EN_DAYS)) {
    const re = new RegExp(`every\\s+${name}[\\s\\S]*?(\\d{1,2})(?::(\\d{2}))?`);
    m = msg.match(re);
    if (m) {
      const hour = parseInt(m[1]);
      const minute = parseInt(m[2] || "0");
      const recurrence = `weekly:${dayNum}:${pad(hour)}:${pad(minute)}`;
      return { remindAt: nextWeeklyOccurrence(dayNum, hour, minute, timezone), recurrence };
    }
  }

  return null;
}

function nextDailyOccurrence(hour, minute, timezone) {
  const t = zonedDate(0, hour, minute, timezone);
  if (t > new Date()) return t;
  return zonedDate(1, hour, minute, timezone);
}

function nextWeeklyOccurrence(targetDay, hour, minute, timezone) {
  const now = new Date();
  const todayDay = parseInt(
    now.toLocaleDateString("en-US", { timeZone: timezone, weekday: "short" }) === "Sun"
      ? 0
      : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(
          now.toLocaleDateString("en-US", { timeZone: timezone, weekday: "short" })
        )
  );
  // Proper current day in timezone
  const currentDay = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(
    now.toLocaleDateString("en-US", { timeZone: timezone, weekday: "short" })
  );
  let daysUntil = (targetDay - currentDay + 7) % 7;
  const candidate = zonedDate(daysUntil, hour, minute, timezone);
  if (candidate <= now) daysUntil += 7;
  return zonedDate(daysUntil, hour, minute, timezone);
}

// ── Next occurrence after firing ─────────────────────────────────────────────

function nextOccurrence(recurrence, timezone) {
  const parts = recurrence.split(":");
  if (parts[0] === "daily") {
    const hour = parseInt(parts[1]);
    const minute = parseInt(parts[2]);
    return nextDailyOccurrence(hour, minute, timezone);
  }
  if (parts[0] === "weekly") {
    const day = parseInt(parts[1]);
    const hour = parseInt(parts[2]);
    const minute = parseInt(parts[3]);
    // Force next week
    const t = nextWeeklyOccurrence(day, hour, minute, timezone);
    // Make sure it's actually next week (at least 6 days away)
    const minNext = new Date(Date.now() + 6 * 86400000);
    if (t < minNext) return new Date(t.getTime() + 7 * 86400000);
    return t;
  }
  return null;
}

// ── One-time time parsing ────────────────────────────────────────────────────

function parseTime(msg, timezone) {
  const now = new Date();

  // "בעוד X דקות" / "עוד X דקות" / "in X minutes"
  let m = msg.match(/(?:in|בעוד|עוד)\s+(\d+)\s*(?:minutes?|דקות?|דק'?)/);
  if (m) return addMinutes(now, parseInt(m[1]));

  // "X דקות" alone (e.g. "5 דקות")
  m = msg.match(/^(\d+)\s*(?:דקות?|דק'?)$/);
  if (m) return addMinutes(now, parseInt(m[1]));

  // "בעוד X שעות" / "עוד X שעות" / "in X hours"
  m = msg.match(/(?:in|בעוד|עוד)\s+(\d+)\s*(?:hours?|שעות?|שעה)/);
  if (m) return addMinutes(now, parseInt(m[1]) * 60);

  // "X שעות" alone
  m = msg.match(/^(\d+)\s*(?:שעות?|שעה)$/);
  if (m) return addMinutes(now, parseInt(m[1]) * 60);

  // "בעוד X ימים" / "עוד X ימים" / "in X days"
  m = msg.match(/(?:in|בעוד|עוד)\s+(\d+)\s*(?:days?|ימים?|יום)/);
  if (m) return addMinutes(now, parseInt(m[1]) * 60 * 24);

  // "דקה" alone = 1 minute
  if (/^(?:עוד\s+)?דקה$/.test(msg)) return addMinutes(now, 1);

  // "שעה" alone = 1 hour
  if (/^(?:עוד\s+)?שעה$/.test(msg)) return addMinutes(now, 60);

  m = msg.match(/(?:tomorrow|מחר)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) return zonedDate(1, parseInt(m[1]), parseInt(m[2] || "0"), timezone);

  m = msg.match(/(?:tonight|הלילה)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    let h = parseInt(m[1]);
    if (h < 12) h += 12;
    return zonedDate(0, h, parseInt(m[2] || "0"), timezone);
  }

  m = msg.match(/(?:today|היום)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const t = zonedDate(0, parseInt(m[1]), parseInt(m[2] || "0"), timezone);
    return t > now ? t : zonedDate(1, parseInt(m[1]), parseInt(m[2] || "0"), timezone);
  }

  m = msg.match(/ב-(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const t = zonedDate(0, parseInt(m[1]), parseInt(m[2] || "0"), timezone);
    return t > now ? t : zonedDate(1, parseInt(m[1]), parseInt(m[2] || "0"), timezone);
  }

  m = msg.match(/at\s+(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    let h = parseInt(m[1]);
    if (h <= 7) h += 12;
    const t = zonedDate(0, h, parseInt(m[2] || "0"), timezone);
    return t > now ? t : zonedDate(1, h, parseInt(m[2] || "0"), timezone);
  }

  return null;
}

// ── Text extraction ──────────────────────────────────────────────────────────

function extractReminderText(msg) {
  let m;

  // Hebrew recurring: "כל יום שלישי ב-X לעשות Y" — text after the time
  m = msg.match(/(?:כל\s+(?:יום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|יום))[\s\S]*?\d{1,2}(?::\d{2})?\s+ל?(.+)/i);
  if (m && m[1].trim()) return m[1].trim();

  // Hebrew one-time: "תזכיר לי <text> בעוד/עוד/מחר/..."
  m = msg.match(/תזכיר לי (.+?)(?:\s+(?:בעוד|עוד|מחר|היום|הלילה|בשעה|כל)|\s+ב-\d|$)/i);
  if (m && m[1].trim()) return m[1].trim();

  // English: "remind me to <text> in/at/..."
  m = msg.match(/remind me (?:to )?(.+?)(?:\s+(?:in |at |tomorrow|tonight|today|every)|$)/i);
  if (m && m[1].trim()) return m[1].trim();

  return msg;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function zonedDate(daysFromNow, hour, minute, timezone) {
  const base = new Date(Date.now() + daysFromNow * 86400000);
  const dateStr = base.toLocaleDateString("en-CA", { timeZone: timezone });
  const naive = new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00Z`);
  const utcRepr = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzRepr = new Date(naive.toLocaleString("en-US", { timeZone: timezone }));
  return new Date(naive.getTime() - (tzRepr - utcRepr));
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

module.exports = { parseReminderRequest, nextOccurrence };
