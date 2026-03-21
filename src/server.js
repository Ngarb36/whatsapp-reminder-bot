const express = require("express");
const { parseReminderRequest } = require("./parser");
const { addReminder, listPendingForPhone, deleteReminder } = require("./db");
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
      addReminder(from, reminderText, unixSecs, recurrence);

      const timeStr = formatTime(unixSecs, timezone);
      const recurStr = recurrence ? `\n🔁 חוזרת: ${formatRecurrence(recurrence)}` : "";
      await sendMessage(from, `✅ קבעתי! אזכיר לך *${reminderText}*\n📅 ${timeStr}${recurStr}`);
      return;
    }

    // ── List ──────────────────────────────────────────────────────────────────
    if (result.action === "list") {
      const pending = listPendingForPhone(from);
      if (pending.length === 0) {
        await sendMessage(from, "אין לך תזכורות פעילות. 🎉");
      } else {
        const lines = pending.map((r, i) => {
          const timeStr = formatTime(r.remind_at, timezone);
          const recurStr = r.recurrence ? ` 🔁 ${formatRecurrence(r.recurrence)}` : "";
          return `*${i + 1}.* ${r.message} — ${timeStr}${recurStr}`;
        });
        await sendMessage(
          from,
          `📋 *התזכורות שלך:*\n\n${lines.join("\n")}\n\nלמחוק: שלח "מחק <מספר>"`
        );
      }
      return;
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    if (result.action === "delete") {
      const pending = listPendingForPhone(from);
      const idx = result.index - 1;
      if (idx < 0 || idx >= pending.length) {
        await sendMessage(from, `לא מצאתי תזכורת מספר ${result.index}. שלח "list" לראות את הרשימה.`);
        return;
      }
      const r = pending[idx];
      deleteReminder(r.id, from);
      await sendMessage(from, `🗑️ מחקתי: *${r.message}*`);
      return;
    }

    // ── Cancel help ───────────────────────────────────────────────────────────
    if (result.action === "cancel_help") {
      await sendMessage(from, `לביטול תזכורת שלח "list" כדי לראות את המספרים, ואז "מחק <מספר>"`);
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
