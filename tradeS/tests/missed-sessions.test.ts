import { describe, it, expect } from "vitest";
import { missedSessions, missedSessionsMessage } from "@/lib/bot/missed-sessions";

/**
 * The real week this was built for. Sep 7 2026 was Labor Day, so the
 * exchange calendar simply does not contain it — which is the whole reason
 * the calendar is fetched instead of counting weekdays.
 */
const WEEK = [
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
];

describe("missedSessions", () => {
  it("finds the sessions that actually went unscanned", () => {
    // What the database really held: 9, 10, 11 and 14 scanned; 8 and 15 not.
    const report = missedSessions(WEEK, ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14"], "2026-09-16");
    expect(report.missed).toEqual(["2026-09-15"]);
    expect(report.lastScan).toBe("2026-09-14");
  });

  it("ignores sessions before the very first scan", () => {
    // The heartbeat only began on the day it shipped. Reporting every
    // session before that as missed would bury the ones that matter.
    const report = missedSessions(WEEK, ["2026-09-09", "2026-09-10"], "2026-09-11");
    expect(report.missed).toEqual([]);
    expect(report.missed).not.toContain("2026-09-08");
  });

  it("never reports today, whose appointment has not come round yet", () => {
    // Checked in the morning, today is simply not due — reporting it would
    // make the alert fire every single day.
    const report = missedSessions(WEEK, ["2026-09-14", "2026-09-15"], "2026-09-16");
    expect(report.missed).toEqual([]);
  });

  it("does not cry wolf about a market holiday", () => {
    // Labor Day is absent from the exchange calendar, so a weekday-counting
    // version would have flagged it and taught its reader to ignore the rest.
    const withHoliday = ["2026-09-04", ...WEEK];
    const report = missedSessions(withHoliday, ["2026-09-04", "2026-09-08"], "2026-09-09");
    expect(report.missed).toEqual([]);
  });

  it("reports a run of several missed sessions in order", () => {
    const report = missedSessions(WEEK, ["2026-09-08"], "2026-09-16");
    expect(report.missed).toEqual(["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15"]);
  });

  it("stays quiet before there is any history to judge", () => {
    const report = missedSessions(WEEK, [], "2026-09-16");
    expect(report.missed).toEqual([]);
    expect(report.lastScan).toBeNull();
  });

  it("counts what it checked, so a clean report is not a blank one", () => {
    const report = missedSessions(WEEK, ["2026-09-08", "2026-09-09"], "2026-09-10");
    expect(report.checked).toBe(2);
    expect(report.missed).toEqual([]);
  });

  it("is not confused by an unsorted calendar", () => {
    const shuffled = ["2026-09-14", "2026-09-09", "2026-09-15", "2026-09-08"];
    const report = missedSessions(shuffled, ["2026-09-08", "2026-09-14"], "2026-09-16");
    expect(report.missed).toEqual(["2026-09-09", "2026-09-15"]);
  });
});

describe("missedSessionsMessage", () => {
  it("says nothing when nothing was missed", () => {
    // Silence is the normal case and must stay silent, or the channel that
    // also carries fills and halts gets muted.
    expect(missedSessionsMessage({ missed: [], checked: 5, lastScan: "2026-09-15" })).toBeNull();
  });

  it("names the day and does not blame the strategy", () => {
    const message = missedSessionsMessage({ missed: ["2026-09-15"], checked: 6, lastScan: "2026-09-14" })!;
    expect(message).toContain("2026-09-15");
    expect(message).toContain("1 sesión");
    expect(message).toContain("15:50");
    // The bot did not fail; it was never awake to look.
    expect(message).toContain("no llegó a mirar");
  });

  it("agrees in number for several days", () => {
    const message = missedSessionsMessage({
      missed: ["2026-09-08", "2026-09-15"],
      checked: 6,
      lastScan: "2026-09-14",
    })!;
    expect(message).toContain("2 sesiones");
    expect(message).toContain("2026-09-08, 2026-09-15");
  });
});
