import { describe, expect, it } from "vitest"

import { formatCompact, formatFull } from "@/next-ui/blocks/format"

describe("formatCompact", () => {
  it("shows the brief's examples", () => {
    expect(formatCompact(0)).toBe("0")
    expect(formatCompact(434)).toBe("434")
    expect(formatCompact(5700)).toBe("5.7K")
    expect(formatCompact(119000)).toBe("119K")
    expect(formatCompact(1400000)).toBe("1.4M")
    expect(formatCompact(28900000)).toBe("28.9M")
    expect(formatCompact(1400000000)).toBe("1.4B")
  })

  it("keeps one decimal only under 100 of a unit and steps up at the edge", () => {
    expect(formatCompact(1000)).toBe("1K")
    expect(formatCompact(12100)).toBe("12.1K")
    expect(formatCompact(999)).toBe("999")
    expect(formatCompact(999_960)).toBe("1M")
    expect(formatCompact(-5700)).toBe("-5.7K")
    expect(formatCompact(null)).toBe("")
    expect(formatCompact(undefined)).toBe("")
  })

  it("formatFull carries the exact number for a title", () => {
    expect(formatFull(28912044)).toBe("28,912,044")
    expect(formatFull(null)).toBe("")
  })
})
