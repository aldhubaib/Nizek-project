/**
 * Numbers as the blocks show them (docs/blocks-brief.md, decision 11): `434`, `5.7K`, `119K`,
 * `1.4M`, `28.9M`, `1.4B` — one decimal under 100 of a unit, none above. Locale `en`. The full
 * value goes in a `title` next to it; see `formatFull`.
 */

const UNITS: [number, string][] = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
]

export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ""
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  for (let i = 0; i < UNITS.length; i++) {
    const [size, suffix] = UNITS[i]
    if (abs < size) continue
    const v = abs / size
    // 5.7K, 28.9M (one decimal under 100 of the unit); 119K, 434M (none from 100 up)
    const text = v < 100 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v).toString()
    // 999.96K rounds to "1000K": say 1M instead
    if (text === "1000" && i > 0) return `${sign}1${UNITS[i - 1][1]}`
    return `${sign}${text}${suffix}`
  }
  if (Math.round(abs) === 1000) return `${sign}1K`
  return Math.round(n).toLocaleString("en-US")
}

/** The exact number for a `title`: `28,912,044`. */
export function formatFull(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ""
  return n.toLocaleString("en-US")
}
