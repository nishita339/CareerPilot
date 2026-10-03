// RFC 5545 Compliant iCalendar (.ics) Generator
// Allows students to export all application deadlines, exam forms, and interview dates
// directly into Google Calendar, Outlook, and Apple Calendar.
// Pure module: deterministic, no external dependencies, unit testable.

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  url?: string;
  startDate: string | number; // YYYY-MM-DD string or timestamp in ms
  endDate?: string | number;
  allDay?: boolean;
  category?: "Application Deadline" | "Exam Form" | "Interview" | "Scholarship Deadline";
  alarmDaysBefore?: number; // e.g., 2 days before
}

function formatIcsDate(dateInput: string | number, allDay: boolean = true): string {
  const d = typeof dateInput === "number" ? new Date(dateInput) : new Date(dateInput);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided for calendar event: ${dateInput}`);
  }

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());

  if (allDay) {
    return `${year}${month}${day}`;
  }

  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Builds an RFC 5545 iCalendar string from a list of events.
 */
export function buildIcsCalendar(
  events: CalendarEvent[],
  calendarName: string = "CareerPilot Deadlines",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CareerPilot//Opportunity & Exam Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-WR-TIMEZONE:UTC",
  ];

  for (const ev of events) {
    const isAllDay = ev.allDay ?? true;
    const dtStart = formatIcsDate(ev.startDate, isAllDay);
    const dtEnd = ev.endDate ? formatIcsDate(ev.endDate, isAllDay) : dtStart;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id.replace(/[^a-zA-Z0-9_-]/g, "-")}@careerpilot.app`);
    lines.push(`DTSTAMP:${formatIcsDate(Date.now(), false)}`);

    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    } else {
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);

    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    }

    if (ev.url) {
      lines.push(`URL:${ev.url.trim()}`);
    }

    if (ev.category) {
      lines.push(`CATEGORIES:${escapeIcsText(ev.category)}`);
    }

    // Optional notification alarm (e.g. 2 days prior)
    if (ev.alarmDaysBefore && ev.alarmDaysBefore > 0) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:Reminder: ${escapeIcsText(ev.title)}`);
      lines.push(`TRIGGER:-P${ev.alarmDaysBefore}D`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
