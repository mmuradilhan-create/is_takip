import { validRemindAt } from "./workspace-notes.js";

const pad = (value) => String(value).padStart(2, "0");
const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});

/** The local "YYYY-MM-DDTHH:MM" minute of a date. */
export function localMinute(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Milliseconds of a reminder's local minute, or null. */
export function reminderTime(remindAt) {
  if (!validRemindAt(remindAt)) return null;
  const [date, time] = remindAt.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

const withReminder = (notes) =>
  (Array.isArray(notes) ? notes : []).filter(
    (note) => reminderTime(note?.remindAt) !== null,
  );

/** Reminders whose minute has come, oldest first. */
export function dueReminders(notes, now = Date.now()) {
  return withReminder(notes)
    .filter((note) => reminderTime(note.remindAt) <= now)
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
}

/** Reminders still ahead, soonest first. */
export function upcomingReminders(notes, now = Date.now()) {
  return withReminder(notes)
    .filter((note) => reminderTime(note.remindAt) > now)
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
}

/** "Bugün 14:00", "Yarın 09:00", "12 Kas 14:00" or "12 Kas 2027 14:00". */
export function formatReminder(remindAt, now = new Date()) {
  const time = reminderTime(remindAt);
  if (time === null) return "";
  const date = new Date(time);
  const clock = remindAt.slice(11);
  const day = (value) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const difference = Math.round((day(date) - day(now)) / 86400000);
  if (difference === 0) return `Bugün ${clock}`;
  if (difference === 1) return `Yarın ${clock}`;
  if (difference === -1) return `Dün ${clock}`;
  const label = dayFormatter.format(date);
  return date.getFullYear() === now.getFullYear()
    ? `${label} ${clock}`
    : `${label} ${date.getFullYear()} ${clock}`;
}

/** Snoozed minute: one hour from now, or tomorrow at 09:00. */
export function snoozedMinute(kind, now = new Date()) {
  if (kind === "hour") return localMinute(new Date(now.getTime() + 3600000));
  if (kind === "tomorrow") {
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      9,
      0,
    );
    return localMinute(tomorrow);
  }
  throw new Error("Erteleme seçeneği geçersiz.");
}

/** Default for a new reminder: the next full hour today, at least 09:00. */
export function defaultReminder(now = new Date()) {
  const next = new Date(now.getTime());
  next.setMinutes(0, 0, 0);
  next.setHours(Math.max(9, next.getHours() + 1));
  if (next.getHours() >= 21 || next.getDate() !== now.getDate()) {
    return snoozedMinute("tomorrow", now);
  }
  return localMinute(next);
}

/** Notes with a reminder changed for one note; others stay exact. */
export function withNoteReminder(notes, id, remindAt, updatedAt) {
  if (remindAt !== null && !validRemindAt(remindAt))
    throw new Error("Hatırlatma tarihi ve saati geçersiz.");
  let found = false;
  const next = notes.map((note) => {
    if (note.id !== id) return note;
    found = true;
    const { remindAt: _previous, ...rest } = note;
    return {
      ...rest,
      ...(remindAt === null ? {} : { remindAt }),
      updatedAt,
    };
  });
  if (!found) throw new Error("Bu not artık bulunamıyor.");
  return next;
}
