const cron = require("node-cron");
const { getDueReminders, markSent } = require("./db");
const { sendMessage } = require("./whatsapp");

function formatReminderMessage(text) {
  return `⏰ Reminder: ${text}`;
}

async function processDueReminders() {
  const due = getDueReminders();
  if (due.length === 0) return;

  for (const reminder of due) {
    try {
      await sendMessage(reminder.phone, formatReminderMessage(reminder.message));
      markSent(reminder.id);
      console.log(`[scheduler] Sent reminder #${reminder.id} to ${reminder.phone}: "${reminder.message}"`);
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder #${reminder.id}:`, err.message);
      // Don't mark as sent — will retry next minute
    }
  }
}

function start() {
  // Run every minute
  cron.schedule("* * * * *", () => {
    processDueReminders().catch((err) =>
      console.error("[scheduler] Unexpected error:", err)
    );
  });
  console.log("[scheduler] Started — checking for due reminders every minute.");
}

module.exports = { start };
