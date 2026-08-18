# Responsive Components — Reference

Detailed breakpoints, the `cn` helper, and primitive contracts/implementations. Read this before creating a primitive so APIs stay consistent across the codebase.

## Breakpoints (Tailwind v4 defaults)

| Prefix | Min width | Typical target |
|--------|-----------|----------------|
| (base) | 0 | phones (design here first) |
| `sm:` | 640px | large phones / small tablets |
| `md:` | 768px | tablets |
| `lg:` | 1024px | laptops — three-pane layout becomes static columns here |
| `xl:` | 1280px | desktops |
| `2xl:` | 1536px | wide desktops |

Rule of thumb for this app: **below `lg` the side regions are drawers; at `lg+` they are static columns.**

## Responsive patterns specific to this app

- **App shell height**: `h-dvh overflow-x-hidden` (not `h-screen`).
- **ModelPicker** (`w-56`): becomes a left `Drawer` below `lg`, static `lg:w-56` column at `lg+`. Trigger with a hamburger `IconButton` in the top bar.
- **Sidebar** (`w-80`): becomes a right `Drawer` below `lg`, static `lg:w-80` column at `lg+`.
- **Canvas**: always flex-1; on small screens it is the only visible region by default.
- **Top bar / bottom toolbar**: hide non-essential chrome below `sm` (`hidden sm:flex`); keep primary actions reachable.
- **Node card**: cap width with `w-full max-w-sm` so it never overflows narrow viewports.

## The `cn` helper

Create once at `src/lib/cn.ts`. No dependency needed:

```ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

If `clsx`/`tailwind-merge` are later added, swap the body; keep the signature.

## UI primitive contracts

### Button — `src/components/ui/Button.tsx`

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-green text-surface-900 hover:bg-accent-green/90",
  secondary: "bg-surface-700 text-gray-200 border border-surface-500 hover:bg-surface-600",
  ghost: "text-gray-300 hover:bg-surface-700",
};

// md meets the 44px touch minimum; sm is for dense desktop toolbars only.
const SIZES: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1 rounded",
  md: "text-sm px-4 min-h-11 rounded-lg",
};

export function Button({
  variant = "secondary", size = "md", fullWidth, leftIcon, className, children, ...rest
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/60",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant], SIZES[size], fullWidth && "w-full", className,
      )}
      {...rest}
    >
      {leftIcon && <span aria-hidden>{leftIcon}</span>}
      {children}
    </button>
  );
}
```

### IconButton — `src/components/ui/IconButton.tsx`

Square, accessible, enforced touch size. `aria-label` is required (TS-enforced).

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  children: ReactNode; // the icon
  active?: boolean;
}

export function IconButton({ active, className, children, ...rest }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded transition-colors",
        "min-h-11 min-w-11 lg:min-h-9 lg:min-w-9", // generous on touch, tighter on desktop
        active ? "text-accent-green bg-surface-700" : "text-gray-400 hover:bg-surface-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/60",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
```

### Panel — `src/components/ui/Panel.tsx`

Surface container with optional header/footer and a scrollable body. Replaces the repeated `bg-surface-800 border ... flex flex-col h-full overflow-hidden` shells in `Sidebar` and `ModelPicker`.

```tsx
import type { ElementType, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props {
  as?: ElementType;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ as: Tag = "div", header, footer, className, children }: Props) {
  return (
    <Tag className={cn("bg-surface-800 flex flex-col h-full overflow-hidden", className)}>
      {header && <div className="border-b border-surface-600 shrink-0">{header}</div>}
      <div className="flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="border-t border-surface-600 shrink-0">{footer}</div>}
    </Tag>
  );
}
```

### Divider — `src/components/ui/Divider.tsx`

```tsx
import { cn } from "../../lib/cn";

export function Divider({ orientation = "horizontal", className }: {
  orientation?: "horizontal" | "vertical"; className?: string;
}) {
  return (
    <div
      role="separator"
      className={cn(
        orientation === "vertical" ? "w-px h-5 bg-surface-600" : "h-px w-full bg-surface-600",
        className,
      )}
    />
  );
}
```

## Layout primitive contracts

### Stack & Inline — `src/components/layout/`

Thin flex wrappers so spacing is consistent and intent is readable.

```tsx
// Stack.tsx — vertical
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
const GAP = { 0: "", 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4" } as const;
export function Stack({ gap = 3, className, children }: {
  gap?: keyof typeof GAP; className?: string; children: ReactNode;
}) {
  return <div className={cn("flex flex-col", GAP[gap], className)}>{children}</div>;
}
```

```tsx
// Inline.tsx — horizontal
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
const GAP = { 0: "", 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4" } as const;
export function Inline({ gap = 2, align = "center", justify = "start", className, children }: {
  gap?: keyof typeof GAP;
  align?: "start" | "center" | "end";
  justify?: "start" | "center" | "end" | "between";
  className?: string; children: ReactNode;
}) {
  return (
    <div className={cn(
      "flex", GAP[gap], `items-${align}`, `justify-${justify}`, className,
    )}>{children}</div>
  );
}
```

### Drawer — `src/components/layout/Drawer.tsx`

Slide-in overlay for small screens. Render side panels inside a `Drawer` below `lg` and as static columns at `lg+`.

```tsx
import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  children: ReactNode;
}

export function Drawer({ open, onClose, side = "left", children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={cn("fixed inset-0 z-40 lg:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 bottom-0 w-72 max-w-[85vw] bg-surface-800 shadow-xl transition-transform",
          side === "left" ? "left-0" : "right-0",
          open ? "translate-x-0" : side === "left" ? "-translate-x-full" : "translate-x-full",
        )}
      >
        {children}
      </div>
    </div>
  );
}
```

### AppShell — `src/components/layout/AppShell.tsx`

Owns the responsive three-region structure and drawer open/close state. `App.tsx` supplies the three regions and renders the canvas as `children`.

```tsx
import { useState, type ReactNode } from "react";
import { Drawer } from "./Drawer";
import { IconButton } from "../ui/IconButton";

interface Props {
  left: ReactNode;   // ModelPicker
  right: ReactNode;  // Sidebar
  children: ReactNode; // Canvas
}

export function AppShell({ left, right, children }: Props) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  return (
    <div className="h-dvh flex overflow-hidden overflow-x-hidden">
      {/* Static column at lg+; Drawer below lg */}
      <div className="hidden lg:flex">{left}</div>
      <Drawer open={leftOpen} onClose={() => setLeftOpen(false)} side="left">{left}</Drawer>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-12 border-b border-surface-600 flex items-center px-2 gap-2 shrink-0 lg:px-4">
          <IconButton aria-label="Open models" className="lg:hidden" onClick={() => setLeftOpen(true)}>☰</IconButton>
          <div className="flex-1" />
          <IconButton aria-label="Open settings" className="lg:hidden" onClick={() => setRightOpen(true)}>⚙</IconButton>
        </div>
        {children}
      </div>

      <div className="hidden lg:flex">{right}</div>
      <Drawer open={rightOpen} onClose={() => setRightOpen(false)} side="right">{right}</Drawer>
    </div>
  );
}
```

> Note: `Inline` builds class names like `items-${align}`. Tailwind needs the full class to appear in source to keep it; the literal strings above (`items-center`, `justify-between`, etc.) are present in this reference, but if the JIT ever prunes them, switch `Inline` to an explicit lookup map like `Stack`'s `GAP`.

## Accessibility quick checks

- Every `IconButton` has a meaningful `aria-label`.
- Drawers: backdrop click + `Esc` close (built into `Drawer`).
- Focus-visible rings on interactive elements (built into `Button`/`IconButton`).
- Don't convey state with color alone (the active model row uses color + background tint — keep both).
