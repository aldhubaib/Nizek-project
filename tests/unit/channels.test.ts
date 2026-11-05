import { describe, expect, it } from "vitest";
import {
  conversationChannel,
  globalPresenceChannel,
  isStaffOnlyChannel,
  projectChannel,
  taskChannel,
  userChannel,
} from "@/lib/channels";

describe("isStaffOnlyChannel", () => {
  /**
   * Task and project feeds are written for the team. A client is a project
   * member, so the token route's membership check would happily sign them a
   * token — this rule is what stops it, and the route applies it before
   * anything else.
   */
  it("covers the team feeds", () => {
    expect(isStaffOnlyChannel(projectChannel("p1"))).toBe(true);
    expect(isStaffOnlyChannel(taskChannel("t1"))).toBe(true);
  });

  it("leaves the channels a client legitimately needs alone", () => {
    expect(isStaffOnlyChannel(conversationChannel("c1"))).toBe(false);
    expect(isStaffOnlyChannel(userChannel("u1"))).toBe(false);
    expect(isStaffOnlyChannel(globalPresenceChannel())).toBe(false);
  });

  it("is not fooled by an id that starts with a staff namespace", () => {
    expect(isStaffOnlyChannel("conv:project-1")).toBe(false);
    expect(isStaffOnlyChannel("projects:p1")).toBe(false);
    expect(isStaffOnlyChannel("project")).toBe(true);
  });
});
