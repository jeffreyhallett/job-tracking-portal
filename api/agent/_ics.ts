import { CLOSED_STAGES, type Application } from "../../shared/types.js";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string): string {
  // RFC 5545: lines longer than 75 octets are folded with CRLF + space.
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = " " + rest.slice(73);
  }
  out.push(rest);
  return out.join("\r\n");
}
function dateValue(iso: string): string {
  return iso.replace(/-/g, "");
}
function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

type Item = { uid: string; date: string; summary: string; description: string; url?: string };

/** All-day events for deadlines and next actions on non-closed applications. */
export function buildCalendar(apps: readonly Application[], stamp: Date): string {
  const items: Item[] = [];
  for (const a of apps) {
    if (CLOSED_STAGES.includes(a.status)) continue;
    const who = `${a.company} — ${a.role}`;
    if (a.deadline) items.push({ uid: `${a.id}-deadline`, date: a.deadline, summary: `Deadline: ${who}`, description: a.notes ?? "", url: a.url });
    if (a.nextActionDate) items.push({ uid: `${a.id}-next`, date: a.nextActionDate, summary: `${a.nextAction ?? "Next action"}: ${who}`, description: a.notes ?? "", url: a.url });
  }
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//job-tracking-portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Job applications",
  ];
  for (const it of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.uid}@job-tracking-portal`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateValue(it.date)}`,
      `DTEND;VALUE=DATE:${nextDay(it.date)}`,
      `SUMMARY:${esc(it.summary)}`,
    );
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    if (it.url) lines.push(`URL:${esc(it.url)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
