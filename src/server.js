const express = require("express");
const { parseReminderRequest } = require("./parser");
const { addReminder, listPendingForPhone } = require("./db");
const { sendMessage } = require("./whatsapp");

const router = express.Router();

// Twilio sends form-encoded POST bodies
router.use(express.urlencoded({ extended: false }));

function formatTime(unixSeconds, timezone) {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

router.post("/webhook", async (req, res) => {
  // Respond to Twilio immediately so it doesn't retry
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");

  const from = req.body.From; // e.g. "whatsapp:+972521234567"
  const body = (req.body.Body || "").trim();
  const timezone = process.env.TIMEZONE || "UTC";

  if (!from || !body) return;

  console.log(`[webhook] Message from ${from}: "${body}"`);

  try {
    const result = await parseReminderRequest(body, timezone);

    if (result.error) {
      await sendMessage(from, result.error);
      return;
    }

    if (result.action === "remind") {
      const { remindAt, reminderText } = result;
      const unixSecs = Math.floor(remindAt.getTime() / 1000);
      addReminder(from, reminderText, unixSecs);

      const formattedTime = formatTime(unixSecs, timezone);
      await sendMessage(
        from,
        `✅ Got it! I'll remind you to *${reminderText}* on ${formattedTime}.`
      );
      return;
    }

    if (result.action === "list") {
      const pending = listPendingForPhone(from);
      if (pending.length === 0) {
        await sendMessage(from, "You have no pending reminders. 🎉");
      } else {
        const lines = pending.map(
          (r, i) =>
            `${i + 1}. *${r.message}* — ${formatTime(r.remind_at, timezone)}`
        );
        await sendMessage(
          from,
          `📋 Your upcoming reminders:\n\n${lines.join("\n")}`
        );
      }
      return;
    }

    if (result.action === "cancel") {
      await sendMessage(
        from,
        "To cancel a reminder, please reply with the reminder number from your list. Type *list* to see your reminders."
      );
      return;
    }

    // Unknown / unrelated message
    await sendMessage(
      from,
      `I'm your reminder assistant! 🤖\n\nTry:\n• "Remind me to call Mom in 2 hours"\n• "Remind me tomorrow at 9am to take my meds"\n• "List my reminders"`
    );
  } catch (err) {
    console.error("[webhook] Error handling message:", err);
    await sendMessage(
      from,
      "Sorry, something went wrong on my end. Please try again!"
    ).catch(() => {});
  }
});

module.exports = router;
