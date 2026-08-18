---
name: responsive-components
description: Build and audit the AI Node Studio UI for responsive, mobile-first design and extract reusable layout/UI primitives instead of repeating Tailwind classes. Use when building or editing the app shell, App.tsx, ModelPicker, Sidebar, NodeCard, widgets, or any component, when the user mentions responsive, mobile, breakpoints, layout, drawers, touch targets, or reusable components.
---

# Responsive Components

Keep AI Node Studio responsive (mobile-first) and DRY by routing repeated markup through a small set of layout + UI primitives. The app is currently a fixed three-pane desktop layout (`ModelPicker | Canvas | Sidebar`); the job is to make new and existing UI adapt down to phones while consolidating duplicated Tailwind class strings into components.

## When building or editing any component, do all of this

1. **Mobile-first**: write base classes for the smallest screen, then add `sm: md: lg: xl:` upward. Never start desktop-only.
2. **Reach for a primitive before writing raw markup.** If the markup is a layout (`flex`, `gap`, panel, drawer) or a control (button, icon button) that already has a primitive, use it. If you write the same class string 3+ times, extract a primitive.
3. **No fixed layout widths without a responsive variant.** `w-80` on a panel must become `w-full sm:w-80` (or live inside a `Drawer`). Side regions collapse to drawers/overlays below `lg`.
4. **Touch targets ≥ 44px.** Interactive elements use `min-h-11 min-w-11` (the current `w-7 h-7` icon buttons are 28px — too small for touch). `IconButton` enforces this.
5. **Full-height uses `h-dvh`, not `h-screen`** (mobile browser chrome makes `h-screen` overflow).
6. **Prevent overflow.** Flex children that truncate need `min-w-0` + `truncate`; the shell sets `overflow-x-hidden`.
7. **Use theme tokens** (`surface-*`, `accent-*`, `gray-*`) from `src/index.css` — never raw hex in `className`.

## Component library (create on demand, then reuse)

Two folders. Create a primitive the first time it is needed, then always import it.

**Layout — `src/components/layout/`**
| Primitive | Purpose |
|-----------|---------|
| `AppShell` | Responsive three-region shell. Side regions are static columns on `lg+`, drawers below `lg`. |
| `Drawer` | Slide-in overlay panel for small screens (backdrop + focus trap + `Esc` to close). |
| `Stack` | Vertical flex with a `gap` prop. |
| `Inline` | Horizontal flex with `gap` / `align` / `justify` props. |

**UI — `src/components/ui/`**
| Primitive | Purpose |
|-----------|---------|
| `Button` | Variants `primary \| secondary \| ghost`, sizes, `fullWidth`. `md` size meets touch minimum. |
| `IconButton` | Square icon control, enforced `min-h-11 min-w-11`, **requires `aria-label`**. |
| `Panel` | Surface container with optional `header` / `footer` slots and scrollable body. |
| `Divider` | Hairline separator (`horizontal` / `vertical`). |

Primitive contracts, the `cn` helper, and reference implementations are in [reference.md](reference.md). Read it before creating a primitive so the API stays consistent. Widget conventions still apply — see `.cursor/rules/widget-conventions.mdc`.

## Workflow

```
- [ ] 1. Run the checker:  node .cursor/skills/responsive-components/scripts/check-responsive.mjs
- [ ] 2. Build/edit the component mobile-first, using existing primitives
- [ ] 3. Extract a primitive for any markup repeated 3+ times or any new layout/control pattern
- [ ] 4. Verify the 7 rules above are met
- [ ] 5. Re-run the checker; resolve or consciously accept each warning
- [ ] 6. Sanity-check widths at 320 / 375 / 768 / 1024 / 1440 px
```

## Checker script

Reports likely responsive + duplication issues. Run from the project root:

```bash
node .cursor/skills/responsive-components/scripts/check-responsive.mjs
```

It flags: `h-screen` usage, fixed layout widths missing a responsive variant, sub-44px interactive targets, class strings duplicated across the codebase (extraction candidates), and raw hex colors in markup. Warnings are heuristics — treat them as a review checklist, not hard failures.

## Quick examples

Replace a one-off button:

```tsx
// before
<button className="w-full flex items-center justify-center gap-2 text-sm font-medium text-surface-900 bg-accent-green hover:bg-accent-green/90 rounded-lg py-2.5 transition-colors">
  <span>→</span> Run selected
</button>

// after
<Button variant="primary" fullWidth leftIcon="→">Run selected</Button>
```

Make a fixed side panel responsive:

```tsx
// before — overflows on phones
<div className="w-80 bg-surface-800 border-l border-surface-600 ...">

// after — drawer under lg, static column at lg+
<Panel as="aside" className="w-full sm:w-80 lg:static">  {/* inside <Drawer> below lg */}
```
