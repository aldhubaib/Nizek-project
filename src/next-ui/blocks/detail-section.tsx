"use client"

import * as React from "react"
import { Check, ChevronDown, Copy } from "lucide-react"

import { cn } from "@/next-ui/lib/cn"
import { Button } from "@/next-ui/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/next-ui/ui/collapsible"

/**
 * A collapsible section of a detail (Social AI's blocks brief, decision 9): a title row with an
 * optional muted count or note and an optional Copy button that copies `copyText`, then the
 * content. Open by default unless `defaultOpen={false}`. The Copy button says "Copied" for a
 * moment instead of raising a toast (the new UI has no toaster yet).
 */
export function DetailSection({
  title,
  meta,
  copyText,
  defaultOpen = true,
  children,
  className,
  testId,
}: {
  title: string
  meta?: React.ReactNode
  copyText?: string
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
  testId?: string
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(id)
  }, [copied])
  const copy = async () => {
    if (!copyText) return
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("border-t pt-3", className)} data-testid={testId ?? "detail-section"}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium" aria-label={`${title} section`}>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            <span className="truncate">{title}</span>
            {meta && <span className="truncate font-normal text-muted-foreground">· {meta}</span>}
          </button>
        </CollapsibleTrigger>
        {copyText && (
          <Button variant="ghost" size="xs" onClick={copy} aria-label={`Copy ${title.toLowerCase()}`}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
