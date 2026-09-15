import { describe, expect, it } from "vitest";
import { googleAccountHasCalendarScope } from "../../src/lib/google-calendar-scope";

describe("google calendar scope", () => {
  it("accepts the events scope Google stores on the account", () => {
    expect(
      googleAccountHasCalendarScope(
        "openid email profile https://www.googleapis.com/auth/calendar.events",
      ),
    ).toBe(true);
  });

  it("rejects a sign-in that only has identity scopes", () => {
    expect(googleAccountHasCalendarScope("openid email profile")).toBe(false);
    expect(googleAccountHasCalendarScope(null)).toBe(false);
  });
});
