const cron = require("node-cron");
const { getDueReminders, markSent, rescheduleRecurring } = require("./db");
const { sendReminderWithButtons } = require("./whatsapp");
const { nextOccurrence } = require("./parser");

const TIMEZONE = process.env.TIMEZONE || "UTC";

async function processDueReminders() {
  const due = await getDueReminders();
  for (const reminder of due) {
    try {
      await sendReminderWithButtons(reminder.phone, reminder.message);

      if (reminder.recurrence) {
        const next = nextOccurrence(reminder.recurrence, TIMEZONE);
        if (next) {
          await rescheduleRecurring(reminder.id, Math.floor(next.getTime() / 1000));
          console.log(`[scheduler] Rescheduled recurring #${reminder.id} → ${next.toISOString()}`);
        } else {
          await markSent(reminder.id);
        }
      } else {
        await markSent(reminder.id);
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
