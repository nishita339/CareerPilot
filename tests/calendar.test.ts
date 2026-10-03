import { describe, expect, test } from "bun:test";
import { buildIcsCalendar, type CalendarEvent } from "../src/convex/calendar";

describe("calendar generator (.ics)", () => {
  test("generates valid RFC 5545 calendar structure", () => {
    const events: CalendarEvent[] = [
      {
        id: "job-deadline-123",
        title: "Acme Corp SWE Intern Application Deadline",
        description: "Review resume and submit application form.",
        url: "https://example.com/jobs/acme-swe",
        startDate: "2026-11-15",
        category: "Application Deadline",
        alarmDaysBefore: 2,
      },
      {
        id: "gate-exam-2027",
        title: "GATE 2027 Examination",
        startDate: "2027-02-06",
        endDate: "2027-02-07",
        category: "Exam Form",
      },
    ];

    const ics = buildIcsCalendar(events, "My Student Pipeline");

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:My Student Pipeline");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:job-deadline-123@careerpilot.app");
    expect(ics).toContain("SUMMARY:Acme Corp SWE Intern Application Deadline");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261115");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-P2D");
    expect(ics).toContain("SUMMARY:GATE 2027 Examination");
    expect(ics).toContain("END:VCALENDAR");
  });

  test("handles timestamps in ms alongside YYYY-MM-DD strings", () => {
    const ts = new Date("2026-12-01T12:00:00Z").getTime();
    const events: CalendarEvent[] = [
      {
        id: "test-ts",
        title: "Interview Slot",
        startDate: ts,
        allDay: false,
      },
    ];

    const ics = buildIcsCalendar(events);
    expect(ics).toContain("DTSTART:20261201T120000Z");
  });

  test("escapes special characters correctly", () => {
    const events: CalendarEvent[] = [
      {
        id: "special-chars",
        title: "Interview: Google, Meta; Apple",
        description: "Line 1\nLine 2",
        startDate: "2026-10-10",
      },
    ];

    const ics = buildIcsCalendar(events);
    expect(ics).toContain("Interview: Google\\, Meta\\; Apple");
    expect(ics).toContain("Line 1\\nLine 2");
  });
});
