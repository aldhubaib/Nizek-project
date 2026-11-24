import { describe, expect, it } from "vitest";
import { chatPushCopy } from "@/lib/chat-push-copy";

describe("chatPushCopy", () => {
  it("uses the room as the title and leads the body with the sender", () => {
    expect(chatPushCopy({ authorName: "Reyhaneh", place: "Gala", message: "hey" })).toEqual({
      title: "Gala",
      body: "Reyhaneh: hey",
    });
  });

  it("uses the person as the title in a direct message", () => {
    expect(chatPushCopy({ authorName: "Reyhaneh", place: null, message: "hey" })).toEqual({
      title: "Reyhaneh",
      body: "hey",
    });
  });

  it("keeps a client room's own name", () => {
    expect(
      chatPushCopy({ authorName: "A client", place: "Gala · Client", message: "the logo is wrong" }),
    ).toEqual({
      title: "Gala · Client",
      body: "A client: the logo is wrong",
    });
  });
});
