import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A page's content column, and the one place the horizontal page gutter is set.
 *
 * Every page in the app lines up on the same left and right edge, and that edge
 * is `--app-gutter` — 20px on phones, growing with the viewport up to 80px on
 * wide screens, plus the device's safe-area inset. `PageHeader` already applies
 * the same value, so a page wrapped in this sits directly under its own title
 * rather than a few pixels off it.
 *
 * It exists as a component rather than a class because the class was easy to
 * forget: pages had drifted to `px-6`, to `p-4`, and in a couple of places to no
 * horizontal padding at all, which is what put buttons and text against the
 * screen edge. A component is visible in review and impossible to half-apply.
 *
 * Vertical rhythm and column width stay with the caller — a settings form wants
 * a narrow centred column and a board wants the full width, and that is a
 * decision about the page, not about its gutter:
 *
 *     <PageBody className="mx-auto max-w-3xl py-8">…</PageBody>
 *
 * Anything that needs the gutter but is not a page body — a sticky composer, a
 * toolbar pinned above a scroll area — should use the `px-app` class directly.
 */
export function PageBody({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("px-app", className)} {...props} />;
}
