const cron = require("node-cron");
const { getDueReminders, markSent, rescheduleRecurring, setLastFired } = require("./db");
const { sendReminderWithButtons } = require("./whatsapp");
const { nextOccurrence } = require("./parser");

const TIMEZONE = process.env.TIMEZONE || "UTC";

async function processDueReminders() {
  const due = await getDueReminders();
  for (const reminder of due) {
    try {
      await sendReminderWithButtons(reminder.phone, reminder.message);
      await setLastFired(reminder.phone, reminder.id);

      if (reminder.recurrence) {
        // Recurring: schedule next occurrence
        const next = nextOccurrence(reminder.recurrence, TIMEZONE, reminder.remind_at);
        if (next) {
          await rescheduleRecurring(reminder.id, Math.floor(next.getTime() / 1000));
        } else {
          await markSent(reminder.id);
        }
      } else {
        // One-time: reschedule 24h ahead (stays until "בוצע")
        const next24h = Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000);
        await rescheduleRecurring(reminder.id, next24h);
      }

      console.log(`[scheduler] Sent reminder #${reminder.id} to ${reminder.phone}: "${reminder.message}"`);
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder #${reminder.id}:`, err.message);
    }
  }
}

function start() {
  cron.schedule("* * * * *", () => {
    processDueReminders().catch((err) =>
      console.error("[scheduler] Unexpected error:", err)
    );
  });
  console.log("[scheduler] Started — checking for due reminders every minute.");
}

module.exports = { start };
