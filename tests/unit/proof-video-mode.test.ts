import { describe, expect, it } from "vitest";

import {
  PROOF_VIDEO_MODES,
  PROOF_VIDEO_MODE_LABEL,
  SPRINT_REVIEW_VIDEO_MISSING,
  canHandOverVideo,
  isProofVideoMode,
  nameList,
  proofVideoModeOf,
  sprintReviewVideoRequired,
  taskVideoRequired,
} from "@/lib/proof-video-mode";
import { sprintEndGaps } from "@/lib/sprint-planning-doc";
import { describeActivity } from "@/lib/task-history-format";
import { proofBypassPreview, type ProofBypassPayload } from "@/lib/proof-bypass-payload";

describe("the project's video rule", () => {
  it("has three modes, named as the setting shows them", () => {
    expect(PROOF_VIDEO_MODES).toEqual(["SELF", "ASSIGNED", "NONE"]);
    expect(PROOF_VIDEO_MODE_LABEL).toEqual({ SELF: "Default", ASSIGNED: "Assign", NONE: "No video" });
  });

  it("reads a stored value, and falls back to Default for anything else", () => {
    expect(proofVideoModeOf("ASSIGNED")).toBe("ASSIGNED");
    expect(proofVideoModeOf("NONE")).toBe("NONE");
    expect(proofVideoModeOf(null)).toBe("SELF");
    expect(proofVideoModeOf(undefined)).toBe("SELF");
    expect(proofVideoModeOf("something-else")).toBe("SELF");
    expect(isProofVideoMode("SELF")).toBe(true);
    expect(isProofVideoMode("self")).toBe(false);
    expect(isProofVideoMode(3)).toBe(false);
  });

  it("asks for a video per task in Default and Assign, and never in No video", () => {
    expect(taskVideoRequired("SELF")).toBe(true);
    expect(taskVideoRequired("ASSIGNED")).toBe(true);
    expect(taskVideoRequired("NONE")).toBe(false);
  });

  it("lets a task be handed to the assigned uploaders only in Assign", () => {
    expect(canHandOverVideo("SELF")).toBe(false);
    expect(canHandOverVideo("ASSIGNED")).toBe(true);
    expect(canHandOverVideo("NONE")).toBe(false);
  });

  it("needs the sprint review recording to end a sprint only in No video", () => {
    expect(sprintReviewVideoRequired("SELF")).toBe(false);
    expect(sprintReviewVideoRequired("ASSIGNED")).toBe(false);
    expect(sprintReviewVideoRequired("NONE")).toBe(true);
  });

  it("names the uploaders in a sentence", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Sara"])).toBe("Sara");
    expect(nameList(["Sara", "Omar"])).toBe("Sara and Omar");
    expect(nameList(["Sara", "Omar", "Lina"])).toBe("Sara, Omar and Lina");
    expect(nameList(["Sara", "", "  "])).toBe("Sara");
  });
});

describe("ending a sprint without its review video", () => {
  it("counts the missing recording as a gap, after the other gaps, and says what to do", () => {
    const gaps = sprintEndGaps({ emptyInfoFields: 0, missingIncompleteReasons: 0, missingReviewVideo: true });
    expect(gaps.total).toBe(1);
    expect(gaps.items.map((i) => i.key)).toEqual(["video"]);
    expect(gaps.items[0].label).toBe("sprint review video");
    expect(gaps.reason).toBe(SPRINT_REVIEW_VIDEO_MISSING);

    const several = sprintEndGaps({ emptyInfoFields: 1, missingIncompleteReasons: 2, missingReviewVideo: true });
    expect(several.total).toBe(4);
    expect(several.items.map((i) => i.key)).toEqual(["info", "reason", "video"]);
    expect(several.reason).toBe("Fill in every Sprint Information field.");
  });

  it("is no gap at all for a project that keeps a video per task", () => {
    const gaps = sprintEndGaps({ emptyInfoFields: 0, missingIncompleteReasons: 0, missingReviewVideo: false });
    expect(gaps.total).toBe(0);
    expect(gaps.reason).toBeNull();
    const absent = sprintEndGaps({ emptyInfoFields: 0, missingIncompleteReasons: 0 });
    expect(absent.total).toBe(0);
  });
});

describe("how a video uploaded for someone else reads", () => {
  const base = {
    id: "a1",
    createdAt: new Date("2026-03-01T00:00:00Z"),
    user: { id: "u1", name: "Sara", imageUrl: null },
    field: "videos",
  };

  it("names the member it was recorded for in the task's history", () => {
    expect(describeActivity({ ...base, action: "proof_of_work", oldValue: "Omar", newValue: "demo.mp4" } as never)).toBe(
      "Sara uploaded proof of work for Omar: demo.mp4",
    );
    expect(describeActivity({ ...base, action: "proof_of_work", oldValue: null, newValue: "demo.mp4" } as never)).toBe(
      "Sara uploaded proof of work: demo.mp4",
    );
  });

  it("previews a request as a video to upload, not a proof to skip", () => {
    const payload: ProofBypassPayload = {
      passId: "pass1",
      taskId: "t1",
      projectId: "p1",
      projectName: "Alpha",
      taskTitle: "Login",
      taskNumber: 4,
      taskType: "FEATURE",
      status: "PENDING",
      requesterId: "u2",
      requesterName: "Omar",
    };
    expect(proofBypassPreview(payload)).toBe("Asked for a proof video to be uploaded");
    expect(proofBypassPreview({ ...payload, status: "APPROVED" })).toBe("Proof video uploaded");
    expect(proofBypassPreview({ ...payload, status: "REJECTED" })).toBe("Video request declined");
  });
});
