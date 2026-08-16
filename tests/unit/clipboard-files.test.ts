// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  filesFromClipboard,
  isEditablePasteTarget,
  namePastedFile,
  type ClipboardLike,
} from "@/lib/clipboard-files";

function pngFile(name: string, size = 12) {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

describe("namePastedFile", () => {
  it("renames generic clipboard screenshot names", () => {
    const named = namePastedFile(pngFile("image.png"));
    expect(named.name.startsWith("Screenshot ")).toBe(true);
    expect(named.name.endsWith(".png")).toBe(true);
    expect(named.type).toBe("image/png");
  });

  it("keeps a real filename", () => {
    const named = namePastedFile(pngFile("board-mock.png"));
    expect(named.name).toBe("board-mock.png");
  });
});

describe("filesFromClipboard", () => {
  it("reads screenshot items even when files is empty", () => {
    const file = pngFile("image.png");
    const data: ClipboardLike = {
      items: [
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => file,
        },
      ],
      files: [],
    };
    const files = filesFromClipboard(data);
    expect(files).toHaveLength(1);
    expect(files[0].name.startsWith("Screenshot ")).toBe(true);
  });

  it("ignores text-only clipboard data", () => {
    const data: ClipboardLike = {
      items: [
        {
          kind: "string",
          type: "text/plain",
          getAsFile: () => null,
        },
      ],
      files: [],
    };
    expect(filesFromClipboard(data)).toEqual([]);
  });

  it("falls back to the files list", () => {
    const files = filesFromClipboard({
      files: [new File([new Uint8Array(20)], "shot.webp", { type: "image/webp" })],
    });
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("shot.webp");
  });
});

describe("isEditablePasteTarget", () => {
  it("treats text inputs as editable and file inputs as not", () => {
    const text = document.createElement("input");
    text.type = "text";
    const file = document.createElement("input");
    file.type = "file";
    const area = document.createElement("textarea");
    expect(isEditablePasteTarget(text)).toBe(true);
    expect(isEditablePasteTarget(file)).toBe(false);
    expect(isEditablePasteTarget(area)).toBe(true);
  });
});
