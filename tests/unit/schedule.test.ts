import { expect, test } from "vitest";
import {
  localDay,
  addCalendarDays,
  choose,
} from "../../src/domain/schedule.js";

test.each([
  ["2026-03-28T23:30:00.000Z", "2026-03-29"],
  ["2026-03-29T22:30:00.000Z", "2026-03-30"],
  ["2026-10-24T22:30:00.000Z", "2026-10-25"],
  ["2026-10-25T22:30:00.000Z", "2026-10-25"],
])("Warsaw calendar day for %s is %s across DST", (instant, day) => {
  expect(localDay(new Date(instant), "Europe/Warsaw")).toBe(day);
});

test.each([
  ["2026-03-28", 2, "2026-03-30"],
  ["2026-10-24", 2, "2026-10-26"],
  ["2028-02-28", 1, "2028-02-29"],
  ["2028-02-28", 2, "2028-03-01"],
  ["2026-12-31", 1, "2027-01-01"],
])("calendar offset %s + %s is %s", (day, offset, expected) => {
  expect(addCalendarDays(day, offset)).toBe(expected);
});

test("choice has a deterministic test source and rejects invalid entropy", () => {
  expect(choose(["pierwszy", "drugi"], () => 0)).toBe("pierwszy");
  expect(choose(["pierwszy", "drugi"], () => 0.999)).toBe("drugi");
  expect(choose([], () => 0)).toBeUndefined();
  for (const value of [-0.1, 1, NaN, Infinity])
    expect(() => choose([1], () => value)).toThrow();
});
