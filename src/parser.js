/**
 * Rule-based reminder parser — Hebrew & English.
 * Strategy: find the TIME anywhere in the message, the rest is the task.
 */

const HE_DAYS = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };
const EN_DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const HE_NUMS = {
  אחד: 1, שניים: 2, שתיים: 2, שלושה: 3, שלוש: 3,
  ארבעה: 4, ארבע: 4, חמישה: 5, חמש: 5, שישה: 6, שש: 6,
  שבעה: 7, שבע: 7, שמונה: 8, תשעה: 9, תשע: 9, עשרה: 10, עשר: 10,
};

// ── Entry point ───────────────────────────────────────────────────────────────

function parseReminderRequest(userMessage, timezone) {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  if (/^(list|רשימה|תראה|הצג)/.test(lower)) return { action: "list" };

  let m = lower.match(/^(?:מחק|בטל|delete|cancel)\s+(\d+)$/);
  if (m) return { action: "delete", index: parseInt(m[1]) };

  m = msg.match(/^(?:ערוך|edit)\s+(\d+)\s+(.+)$/i);
  if (m) return { action: "edit", index: parseInt(m[1]), newValue: m[2].trim() };

  if (/^(?:מחק|בטל|delete|cancel)$/.test(lower)) return { action: "cancel_help" };

  // ── Recurring ──────────────────────────────────────────────────────────────
  const recurring = parseRecurring(lower, timezone);
  if (recurring) {
    return {
      action: "remind",
      remindAt: recurring.remindAt,
      reminderText: extractTaskText(msg, recurring.timeExpr),
      recurrence: recurring.recurrence,
    };
  }

  // ── Multi-line: task on one line, time on another ─────────────────────────
  const lines = msg.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    // Try last line as time
    const t1 = parseTime(lines[lines.length - 1].toLowerCase(), timezone);
    if (t1 && t1 > new Date()) {
      return { action: "remind", remindAt: t1, reminderText: lines.slice(0, -1).join(" "), recurrence: null };
    }
    // Try first line as time
    const t2 = parseTime(lines[0].toLowerCase(), timezone);
    if (t2 && t2 > new Date()) {
      return { action: "remind", remindAt: t2, reminderText: lines.slice(1).join(" "), recurrence: null };
    }
  }

  // ── Single line ────────────────────────────────────────────────────────────
  const { remindAt, timeExpr } = parseTimeWithExpr(lower, timezone);

  if (!remindAt || remindAt <= new Date()) {
    if (remindAt && remindAt <= new Date())
      return { error: "הזמן הזה כבר עבר. תן לי זמן עתידי!" };
    return {
      error:
        "לא הבנתי מתי.\n\nדוגמאות:\n• תזכיר לי להתקלח בעוד שעה\n• תזכיר לי מחר ב-9:00 לקנות חלב\n• תזכיר לי כל יום שלישי ב-20:00 לצלצל לאמא\n• תזכיר לי כל 3 ימים ב-8:00 לשתות תרופה\n• list — לראות את כל התזכורות",
    };
  }

  const reminderText = extractTaskText(msg, timeExpr);
  return { action: "remind", remindAt, reminderText, recurrence: null };
}

// ── Time parsing (returns { remindAt, timeExpr }) ────────────────────────────

function parseTimeWithExpr(msg, timezone) {
  const now = new Date();
  let m;

  const relPatterns = [
    // "בעוד/עוד X דקות"
    { re: /(?:in|בעוד|עוד)\s+(\d+)\s*(?:minutes?|דקות?|דק'?)/, fn: (m) => addMinutes(now, parseInt(m[1])) },
    // "בעוד/עוד X שעות"
    { re: /(?:in|בעוד|עוד)\s+(\d+)\s*(?:hours?|שעות?)/, fn: (m) => addMinutes(now, parseInt(m[1]) * 60) },
    // "בעוד/עוד X ימים"
    { re: /(?:in|בעוד|עוד)\s+(\d+)\s*(?:days?|ימים?|יום)/, fn: (m) => addMinutes(now, parseInt(m[1]) * 60 * 24) },
    // "עוד דקה" / "דקה"
    { re: /(?:(?:עוד|בעוד)\s+)?דקה(?:\s|$)/, fn: () => addMinutes(now, 1) },
    // "עוד שעה" / "שעה"
    { re: /(?:(?:עוד|בעוד)\s+)?שעה(?:\s|$)/, fn: () => addMinutes(now, 60) },
    // "עוד חצי שעה"
    { re: /(?:עוד|בעוד)\s+חצי\s+שעה/, fn: () => addMinutes(now, 30) },
    // "עוד רבע שעה"
    { re: /(?:עוד|בעוד)\s+רבע\s+שעה/, fn: () => addMinutes(now, 15) },
  ];

  for (const { re, fn } of relPatterns) {
    m = msg.match(re);
    if (m) return { remindAt: fn(m), timeExpr: m[0] };
  }

  // "מחר ב-HH:MM" / "מחר בשעה HH" / "מחר HH:MM"
  m = msg.match(/(מחר|tomorrow)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) return { remindAt: zonedDate(1, parseInt(m[2]), parseInt(m[3] || "0"), timezone), timeExpr: m[0] };

  // "הלילה ב-HH"
  m = msg.match(/(הלילה|tonight)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    let h = parseInt(m[2]);
    if (h < 12) h += 12;
    return { remindAt: zonedDate(0, h, parseInt(m[3] || "0"), timezone), timeExpr: m[0] };
  }

  // "היום ב-HH:MM"
  m = msg.match(/(היום|today)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const t = zonedDate(0, parseInt(m[2]), parseInt(m[3] || "0"), timezone);
    return { remindAt: t > now ? t : zonedDate(1, parseInt(m[2]), parseInt(m[3] || "0"), timezone), timeExpr: m[0] };
  }

  // "ב-HH:MM" / "בשעה HH:MM"
  m = msg.match(/(?:ב-|בשעה\s*)(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2] || "0");
    const t = zonedDate(0, h, min, timezone);
    return { remindAt: t > now ? t : zonedDate(1, h, min, timezone), timeExpr: m[0] };
  }

  // "at HH:MM"
  m = msg.match(/at\s+(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    let h = parseInt(m[1]);
    if (h <= 7) h += 12;
    const t = zonedDate(0, h, parseInt(m[2] || "0"), timezone);
    return { remindAt: t > now ? t : zonedDate(1, h, parseInt(m[2] || "0"), timezone), timeExpr: m[0] };
  }

  // Standalone "HH:MM" anywhere
  m = msg.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2]);
    if (h <= 23 && min <= 59) {
      const t = zonedDate(0, h, min, timezone);
      return { remindAt: t > now ? t : zonedDate(1, h, min, timezone), timeExpr: m[0].trim() };
    }
  }

  return { remindAt: null, timeExpr: null };
}

// Simple wrapper used by edit logic
function parseTime(msg, timezone) {
  return parseTimeWithExpr(msg, timezone).remindAt;
}

// ── Task text extraction ──────────────────────────────────────────────────────

function extractTaskText(msg, timeExpr) {
  // Remove reminder trigger words prefix
  let text = msg.replace(/^(?:תזכורת|תזכיר לי|תזכיר)\s*/i, "").trim();

  // Remove the matched time expression
  if (timeExpr) {
    text = text.replace(new RegExp(escapeRegex(timeExpr), "i"), " ").replace(/\s+/g, " ").trim();
  }

  // Remove leading/trailing filler words
  text = text.replace(/^(?:ל|את|ה)\s+/i, "").trim();

  return text || msg;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Recurring ─────────────────────────────────────────────────────────────────

function parseRecurring(msg, timezone) {
  let m;

  // ── "כל יום שלישי" etc. (must be before "כל יום" to avoid false match) ────
  for (const [name, dayNum] of Object.entries(HE_DAYS)) {
    const re = new RegExp(`כל\\s+יום\\s+${name}[\\s\\S]*?(\\d{1,2})(?::(\\d{2}))?`);
    m = msg.match(re);
    if (m) {
      const h = parseInt(m[1]), min = parseInt(m[2] || "0");
      return { remindAt: nextWeeklyOccurrence(dayNum, h, min, timezone), recurrence: `weekly:${dayNum}:${pad(h)}:${pad(min)}`, timeExpr: m[0] };
    }
  }

  // ── "כל X ימים" / "כל ארבעה ימים" / "כל יומיים" (interval) ───────────────
  const interval = parseIntervalRecurring(msg, timezone);
  if (interval) return interval;

  // ── "כל יום" / "every day" (daily) ───────────────────────────────────────
  m = msg.match(/(?:כל יום|every day)[\s\S]*?(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2] || "0");
    return { remindAt: nextDailyOccurrence(h, min, timezone), recurrence: `daily:${pad(h)}:${pad(min)}`, timeExpr: m[0] };
  }

  // ── "כל שלישי" (Hebrew weekly, without "יום") ────────────────────────────
  for (const [name, dayNum] of Object.entries(HE_DAYS)) {
    const re = new RegExp(`כל\\s+${name}[\\s\\S]*?(\\d{1,2})(?::(\\d{2}))?`);
    m = msg.match(re);
    if (m) {
      const h = parseInt(m[1]), min = parseInt(m[2] || "0");
      return { remindAt: nextWeeklyOccurrence(dayNum, h, min, timezone), recurrence: `weekly:${dayNum}:${pad(h)}:${pad(min)}`, timeExpr: m[0] };
    }
  }

  // ── English weekly ────────────────────────────────────────────────────────
  for (const [name, dayNum] of Object.entries(EN_DAYS)) {
    const re = new RegExp(`every\\s+${name}[\\s\\S]*?(\\d{1,2})(?::(\\d{2}))?`);
    m = msg.match(re);
    if (m) {
      const h = parseInt(m[1]), min = parseInt(m[2] || "0");
      return { remindAt: nextWeeklyOccurrence(dayNum, h, min, timezone), recurrence: `weekly:${dayNum}:${pad(h)}:${pad(min)}`, timeExpr: m[0] };
    }
  }

  return null;
}

function parseIntervalRecurring(msg, timezone) {
  let n = null;
  let intervalExpr = null;

  // "כל יומיים" (every 2 days)
  let m = msg.match(/(כל\s+יומיים)/);
  if (m) { n = 2; intervalExpr = m[1]; }

  // "כל 4 ימים" (numeric)
  if (!n) {
    m = msg.match(/(כל\s+(\d+)\s+ימים?)/);
    if (m) { n = parseInt(m[2]); intervalExpr = m[1]; }
  }

  // "every 4 days" (English numeric)
  if (!n) {
    m = msg.match(/(every\s+(\d+)\s+days?)/);
    if (m) { n = parseInt(m[2]); intervalExpr = m[1]; }
  }

  // "כל ארבעה ימים" (Hebrew word numbers)
  if (!n) {
    for (const [word, num] of Object.entries(HE_NUMS)) {
      const re = new RegExp(`(כל\\s+${word}\\s+ימים?)`);
      const match = msg.match(re);
      if (match) { n = num; intervalExpr = match[1]; break; }
    }
  }

  if (!n || !intervalExpr) return null;

  // Parse time from the rest of the message (after removing the interval expression)
  const rest = msg.replace(intervalExpr, " ");
  const { remindAt, timeExpr } = parseTimeWithExpr(rest, timezone);

  const fullTimeExpr = [intervalExpr, timeExpr].filter(Boolean).join(" ");

  if (!remindAt) {
    // No specific time given — first reminder in N days from now
    return { remindAt: new Date(Date.now() + n * 86400000), recurrence: `interval:${n}`, timeExpr: intervalExpr };
  }

  return { remindAt, recurrence: `interval:${n}`, timeExpr: fullTimeExpr };
}

function nextDailyOccurrence(hour, minute, timezone) {
  const t = zonedDate(0, hour, minute, timezone);
  return t > new Date() ? t : zonedDate(1, hour, minute, timezone);
}

function nextWeeklyOccurrence(targetDay, hour, minute, timezone) {
  const now = new Date();
  const currentDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    now.toLocaleDateString("en-US", { timeZone: timezone, weekday: "short" })
  );
  let daysUntil = (targetDay - currentDay + 7) % 7;
  const candidate = zonedDate(daysUntil, hour, minute, timezone);
  if (candidate <= now) daysUntil += 7;
  return zonedDate(daysUntil, hour, minute, timezone);
}

function nextOccurrence(recurrence, timezone, currentRemindAtSecs) {
  const parts = recurrence.split(":");
  if (parts[0] === "daily") {
    return nextDailyOccurrence(parseInt(parts[1]), parseInt(parts[2]), timezone);
  }
  if (parts[0] === "weekly") {
    const t = nextWeeklyOccurrence(parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3]), timezone);
    const minNext = new Date(Date.now() + 6 * 86400000);
    return t < minNext ? new Date(t.getTime() + 7 * 86400000) : t;
  }
  if (parts[0] === "interval") {
    const n = parseInt(parts[1]);
    const base = currentRemindAtSecs ? currentRemindAtSecs * 1000 : Date.now();
    return new Date(base + n * 86400000);
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

module.exports = { parseReminderRequest, nextOccurrence, parseTime };
