import { splitByUrl } from "@/lib/link-preview";
import { cn } from "@/lib/utils";

/**
 * Plain text with any http(s) URLs turned into links.
 *
 * The text is rendered as React children rather than injected as HTML, so a
 * description containing markup is shown literally instead of being executed.
 * Only http and https are matched, which also rules out javascript: hrefs.
 *
 * Deliberately not a "use client" module: it holds no state and no handlers, so
 * the printable report can render it on the server while the dashboard ships it
 * to the browser.
 */
export function LinkifiedText({
  text,
  className,
  linkClassName,
}: {
  text: string;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {splitByUrl(text).map((segment, i) =>
        segment.url ? (
          <a
            key={i}
            href={segment.url}
            target="_blank"
            rel="noopener noreferrer"
            // break-all so a long URL can't force the whole block wider.
            className={cn(
              "underline underline-offset-2 break-all hover:opacity-80",
              linkClassName
            )}
          >
            {segment.text}
          </a>
        ) : (
          segment.text
        )
      )}
    </p>
  );
}
