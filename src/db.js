const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "reminders.json");

function load() {
  if (!fs.existsSync(DB_PATH)) return { nextId: 1, reminders: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function addReminder(phone, message, remindAt) {
  const data = load();
  const id = data.nextId++;
  data.reminders.push({ id, phone, message, remind_at: remindAt, sent: false });
  save(data);
  return id;
}

function getDueReminders() {
  const now = Math.floor(Date.now() / 1000);
  return load().reminders.filter((r) => !r.sent && r.remind_at <= now);
}

function markSent(id) {
  const data = load();
  const r = data.reminders.find((r) => r.id === id);
  if (r) r.sent = true;
  save(data);
}

function listPendingForPhone(phone) {
  const now = Math.floor(Date.now() / 1000);
  return load().reminders.filter(
    (r) => r.phone === phone && !r.sent && r.remind_at > now
  ).sort((a, b) => a.remind_at - b.remind_at);
}

module.exports = { addReminder, getDueReminders, markSent, listPendingForPhone };
