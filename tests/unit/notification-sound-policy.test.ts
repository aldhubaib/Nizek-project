// In-app chime policy — the client-side half of "WhatsApp behavior".

import { describe, expect, it } from "vitest";
import {
  decideNotificationSound,
  isViewingLink,
  shouldPlayNotificationSound,
} from "@/lib/notification-sound-policy";
import { NOTIFICATION_NEW, NOTIFICATION_READ } from "@/lib/channels";

const focusedCtx = {
  currentUserId: "me",
  appFocused: true,
  pathname: "/dashboard",
};

describe("shouldPlayNotificationSound", () => {
  it("chimes for notification.new while the app is focused", () => {
    expect(
      shouldPlayNotificationSound(
        { type: NOTIFICATION_NEW, notification: { linkUrl: "/dashboard/messages/conv-1" } },
        focusedCtx,
      ),
    ).toBe(true);
  });

  it("stays silent for inbox deltas (was the phantom-chime source)", () => {
    expect(
      shouldPlayNotificationSound({ type: "inbox", authorId: "someone" }, focusedCtx),
    ).toBe(false);
  });

  it("stays silent for read-sync events from other devices", () => {
    expect(
      shouldPlayNotificationSound({ type: NOTIFICATION_READ }, focusedCtx),
    ).toBe(false);
  });

  it("stays silent when the app is not focused — OS push owns that case", () => {
    expect(
      shouldPlayNotificationSound(
        { type: NOTIFICATION_NEW, notification: { linkUrl: "/x" } },
        { ...focusedCtx, appFocused: false },
      ),
    ).toBe(false);
  });

  it("stays silent when already viewing the linked thread", () => {
    expect(
      shouldPlayNotificationSound(
        {
          type: NOTIFICATION_NEW,
          notification: { linkUrl: "/dashboard/messages/conv-1" },
        },
        { ...focusedCtx, pathname: "/dashboard/messages/conv-1" },
      ),
    ).toBe(false);
  });

  it("chimes when viewing a DIFFERENT thread", () => {
    expect(
      shouldPlayNotificationSound(
        {
          type: NOTIFICATION_NEW,
          notification: { linkUrl: "/dashboard/messages/conv-1" },
        },
        { ...focusedCtx, pathname: "/dashboard/messages/conv-2" },
      ),
    ).toBe(true);
  });

  it("handles null/garbage payloads", () => {
    expect(shouldPlayNotificationSound(null, focusedCtx)).toBe(false);
    expect(shouldPlayNotificationSound(undefined, focusedCtx)).toBe(false);
    expect(shouldPlayNotificationSound({}, focusedCtx)).toBe(false);
  });

  it("stays silent for self-authored notification.new", () => {
    expect(
      shouldPlayNotificationSound(
        {
          type: NOTIFICATION_NEW,
          authorId: "me",
          notification: { linkUrl: "/dashboard/messages/conv-1" },
        },
        focusedCtx,
      ),
    ).toBe(false);
    expect(
      decideNotificationSound(
        {
          type: NOTIFICATION_NEW,
          authorId: "me",
          notification: { linkUrl: "/dashboard/messages/conv-1" },
        },
        focusedCtx,
      ).reason,
    ).toBe("self-authored");
  });

  it("stays silent when the user disabled in-app sound", () => {
    expect(
      decideNotificationSound(
        { type: NOTIFICATION_NEW, notification: { linkUrl: "/x" } },
        { ...focusedCtx, soundEnabled: false },
      ),
    ).toEqual({ play: false, reason: "sound-disabled" });
  });

  it("records played when every gate passes", () => {
    expect(
      decideNotificationSound(
        { type: NOTIFICATION_NEW, notification: { linkUrl: "/dashboard/messages/conv-1" } },
        focusedCtx,
      ),
    ).toEqual({ play: true, reason: "played" });
  });
});

describe("isViewingLink", () => {
  it("matches identical paths and ignores trailing slashes / query strings", () => {
    expect(isViewingLink("/a/b", "/a/b")).toBe(true);
    expect(isViewingLink("/a/b/", "/a/b")).toBe(true);
    expect(isViewingLink("/a/b", "/a/b?x=1")).toBe(true);
  });

  it("handles absolute URLs", () => {
    expect(isViewingLink("/a/b", "https://app.example.com/a/b")).toBe(true);
  });

  it("does not match different paths or parents", () => {
    expect(isViewingLink("/a/b", "/a/c")).toBe(false);
    expect(isViewingLink("/a", "/a/b")).toBe(false);
  });
});
