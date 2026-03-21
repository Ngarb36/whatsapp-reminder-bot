const express = require("express");
const { parseReminderRequest, nextOccurrence } = require("./parser");
const { addReminder, listPendingForPhone, deleteReminder, updateReminder } = require("./db");
const { sendMessage } = require("./whatsapp");

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function formatTime(unixSeconds, timezone) {
  return new Date(unixSeconds * 1000).toLocaleString("he-IL", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

function formatRecurrence(rec) {
  if (!rec) return "";
  const parts = rec.split(":");
  if (parts[0] === "daily") return `כל יום ב-${parts[1]}:${parts[2]}`;
  if (parts[0] === "weekly") {
    const dayName = DAYS_HE[parseInt(parts[1])] || parts[1];
    return `כל ${dayName} ב-${parts[2]}:${parts[3]}`;
  }
  return rec;
}

router.post("/webhook", async (req, res) => {
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");

  const from = req.body.From;
  const body = (req.body.Body || "").trim();
  const timezone = process.env.TIMEZONE || "UTC";

  if (!from || !body) return;

  console.log(`[webhook] Message from ${from}: "${body}"`);

  try {
    const result = await parseReminderRequest(body, timezone);

    // ── Set reminder ──────────────────────────────────────────────────────────
    if (result.action === "remind") {
      const { remindAt, reminderText, recurrence } = result;
      const unixSecs = Math.floor(remindAt.getTime() / 1000);
      await addReminder(from, reminderText, unixSecs, recurrence);

      const timeStr = formatTime(unixSecs, timezone);
      const recurStr = recurrence ? `\n🔁 חוזרת: ${formatRecurrence(recurrence)}` : "";
      await sendMessage(from, `✅ קבעתי! אזכיר לך: ${reminderText}\n📅 ${timeStr}${recurStr}`);
      return;
    }

    // ── List ──────────────────────────────────────────────────────────────────
    if (result.action === "list") {
      const pending = await listPendingForPhone(from);
      if (pending.length === 0) {
        await sendMessage(from, "אין לך תזכורות פעילות. 🎉");
      } else {
        const lines = pending.map((r, i) => {
          const timeStr = formatTime(r.remind_at, timezone);
          const recurStr = r.recurrence ? `\n   🔁 ${formatRecurrence(r.recurrence)}` : "";
          return `${i + 1}. ${r.message}\n   📅 ${timeStr}${recurStr}`;
        });
        await sendMessage(
          from,
          `📋 התזכורות שלך:\n\n${lines.join("\n\n")}\n\nמחיקה: "מחק 1"\nעריכה: "ערוך 1 [זמן או טקסט חדש]"`
        );
      }
      return;
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    if (result.action === "delete") {
      const pending = await listPendingForPhone(from);
      const idx = result.index - 1;
      if (idx < 0 || idx >= pending.length) {
        await sendMessage(from, `לא מצאתי תזכורת מספר ${result.index}. שלח "list" לראות את הרשימה.`);
        return;
      }
      const r = pending[idx];
      await deleteReminder(r.id, from);
      await sendMessage(from, `🗑️ מחקתי: ${r.message}`);
      return;
    }

    // ── Edit ──────────────────────────────────────────────────────────────────
    if (result.action === "edit") {
      const pending = await listPendingForPhone(from);
      const idx = result.index - 1;
      if (idx < 0 || idx >= pending.length) {
        await sendMessage(from, `לא מצאתי תזכורת מספר ${result.index}. שלח "list" לראות את הרשימה.`);
        return;
      }
      const r = pending[idx];
      const newTime = parseReminderRequest(result.newValue, timezone);

      // If newValue looks like a time → update time only
      if (newTime.action === "remind") {
        const newUnix = Math.floor(newTime.remindAt.getTime() / 1000);
        await updateReminder(r.id, from, { remind_at: newUnix });
        await sendMessage(from, `✏️ עדכנתי את הזמן של "${r.message}" ל-${formatTime(newUnix, timezone)}`);
      } else {
        // Otherwise → update text only
        await updateReminder(r.id, from, { message: result.newValue });
        await sendMessage(from, `✏️ עדכנתי את הטקסט ל: ${result.newValue}`);
      }
      return;
    }

    // ── Cancel help ───────────────────────────────────────────────────────────
    if (result.action === "cancel_help") {
      await sendMessage(from, `שלח "list" לראות את התזכורות, ואז "מחק <מספר>" למחיקה`);
      return;
    }

    // ── Error ─────────────────────────────────────────────────────────────────
    if (result.error) {
      await sendMessage(from, result.error);
      return;
    }

    // ── Unknown ───────────────────────────────────────────────────────────────
    await sendMessage(
      from,
      `אני בוט תזכורות! 🤖\n\nמה שאני יכול:\n• "תזכיר לי להתקלח בעוד שעה"\n• "תזכיר לי מחר ב-9:00 לקנות חלב"\n• "תזכיר לי כל יום שלישי ב-20:00 לצלצל לאמא"\n• "list" — לראות את כל התזכורות\n• "מחק 2" — למחוק תזכורת`
    );
  } catch (err) {
    console.error("[webhook] Error:", err);
    await sendMessage(from, "משהו השתבש. נסה שוב!").catch(() => {});
  }
});

module.exports = router;
