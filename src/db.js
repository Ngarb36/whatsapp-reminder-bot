const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id          SERIAL PRIMARY KEY,
      phone       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      remind_at   BIGINT  NOT NULL,
      recurrence  TEXT,
      sent        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
    );
    CREATE INDEX IF NOT EXISTS idx_remind_at ON reminders (remind_at, sent);

    CREATE TABLE IF NOT EXISTS phone_state (
      phone          TEXT PRIMARY KEY,
      last_fired_id  INT
    );
  `);
}

async function setLastFired(phone, id) {
  await pool.query(
    `INSERT INTO phone_state (phone, last_fired_id) VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET last_fired_id = $2`,
    [phone, id]
  );
}

async function getLastFired(phone) {
  const res = await pool.query(
    "SELECT last_fired_id FROM phone_state WHERE phone = $1",
    [phone]
  );
  return res.rows[0]?.last_fired_id || null;
}

async function addReminder(phone, message, remindAt, recurrence = null) {
  const res = await pool.query(
    "INSERT INTO reminders (phone, message, remind_at, recurrence) VALUES ($1, $2, $3, $4) RETURNING id",
    [phone, message, remindAt, recurrence]
  );
  return res.rows[0].id;
}

async function getDueReminders() {
  const now = Math.floor(Date.now() / 1000);
  const res = await pool.query(
    "SELECT * FROM reminders WHERE sent = FALSE AND remind_at <= $1 ORDER BY remind_at ASC",
    [now]
  );
  return res.rows;
}

async function markSent(id) {
  await pool.query("UPDATE reminders SET sent = TRUE WHERE id = $1", [id]);
}

async function rescheduleRecurring(id, nextRemindAt) {
  await pool.query(
    "UPDATE reminders SET remind_at = $1, sent = FALSE WHERE id = $2",
    [nextRemindAt, id]
  );
}

async function listPendingForPhone(phone) {
  const now = Math.floor(Date.now() / 1000);
  const res = await pool.query(
    "SELECT * FROM reminders WHERE phone = $1 AND sent = FALSE AND remind_at > $2 ORDER BY remind_at ASC",
    [phone, now]
  );
  return res.rows;
}

async function deleteReminder(id, phone) {
  const res = await pool.query(
    "DELETE FROM reminders WHERE id = $1 AND phone = $2",
    [id, phone]
  );
  return res.rowCount > 0;
}

async function updateReminder(id, phone, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${i++}`);
    vals.push(val);
  }
  vals.push(id, phone);
  const res = await pool.query(
    `UPDATE reminders SET ${sets.join(", ")} WHERE id = $${i++} AND phone = $${i}`,
    vals
  );
  return res.rowCount > 0;
}

module.exports = {
  init,
  addReminder,
  getDueReminders,
  markSent,
  rescheduleRecurring,
  listPendingForPhone,
  deleteReminder,
  updateReminder,
  setLastFired,
  getLastFired,
};
