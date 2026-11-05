"use client"

import * as React from "react"

import { Button } from "@/next-ui/ui/button"
import { Spinner } from "@/next-ui/ui/spinner"

/**
 * The end of a long list: a "Show more" button that also fires by itself when it scrolls into
 * view (200 px before, so the next slice is there when the reader arrives). The button stays
 * for keyboards and screen readers. `remaining` re-arms the watcher after each load, so a short
 * page keeps loading until the button leaves the viewport or nothing is left.
 */
export function LoadMore({
  remaining,
  onMore,
  busy,
  children,
}: {
  remaining: number
  onMore: () => void
  busy?: boolean
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const latest = React.useRef(onMore)
  React.useEffect(() => {
    latest.current = onMore // the observer below always calls the newest handler
  })
  React.useEffect(() => {
    const el = ref.current
    if (!el || busy || remaining <= 0) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current()
      },
      { rootMargin: "200px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [remaining, busy])
  return (
    <Button ref={ref} variant="outline" className="self-center" onClick={onMore} disabled={busy} data-testid="load-more">
      {busy && <Spinner />}
      {children}
    </Button>
  )
}
