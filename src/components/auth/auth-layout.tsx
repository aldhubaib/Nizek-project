"use client";

const CARDS = [
  { title: "Mobile App Redesign", stage: "In Dev", color: "bg-primary/20 border-primary/30", stageColor: "text-primary bg-primary/15" },
  { title: "API Integration", stage: "Review", color: "bg-violet-500/20 border-violet-500/30", stageColor: "text-violet-400 bg-violet-500/15" },
  { title: "Dashboard Analytics", stage: "Done", color: "bg-emerald-500/20 border-emerald-500/30", stageColor: "text-emerald-400 bg-emerald-500/15" },
  { title: "Design System v2", stage: "Ready", color: "bg-amber-500/20 border-amber-500/30", stageColor: "text-amber-400 bg-amber-500/15" },
  { title: "Payment Gateway", stage: "Clarify", color: "bg-rose-500/20 border-rose-500/30", stageColor: "text-rose-400 bg-rose-500/15" },
  { title: "User Onboarding", stage: "In Dev", color: "bg-cyan-500/20 border-cyan-500/30", stageColor: "text-cyan-400 bg-cyan-500/15" },
  { title: "Search Refactor", stage: "Review", color: "bg-primary/20 border-primary/30", stageColor: "text-primary bg-primary/15" },
  { title: "Auth System", stage: "Done", color: "bg-emerald-500/20 border-emerald-500/30", stageColor: "text-emerald-400 bg-emerald-500/15" },
  { title: "Notifications", stage: "Ready", color: "bg-violet-500/20 border-violet-500/30", stageColor: "text-violet-400 bg-violet-500/15" },
  { title: "File Upload", stage: "In Dev", color: "bg-amber-500/20 border-amber-500/30", stageColor: "text-amber-400 bg-amber-500/15" },
  { title: "E-commerce Cart", stage: "Clarify", color: "bg-rose-500/20 border-rose-500/30", stageColor: "text-rose-400 bg-rose-500/15" },
  { title: "CI/CD Pipeline", stage: "Done", color: "bg-cyan-500/20 border-cyan-500/30", stageColor: "text-cyan-400 bg-cyan-500/15" },
];

function FloatingCard({ title, stage, color, stageColor }: typeof CARDS[number]) {
  return (
    <div className={`rounded-xl border ${color} backdrop-blur-sm p-3.5 w-[200px] shrink-0`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${stageColor}`}>
          {stage}
        </span>
        <div className="flex -space-x-1">
          <div className="w-4 h-4 rounded-full bg-white/10 border border-white/5" />
          <div className="w-4 h-4 rounded-full bg-white/10 border border-white/5" />
        </div>
      </div>
      <p className="text-[11px] font-medium text-white/70 leading-tight">{title}</p>
      <div className="mt-2.5 flex gap-1.5">
        <div className="h-1 rounded-full bg-white/10 flex-1" />
        <div className="h-1 rounded-full bg-white/5 flex-[0.6]" />
      </div>
    </div>
  );
}

function ScrollColumn({ cards, direction }: { cards: typeof CARDS; direction: "up" | "down" }) {
  const doubled = [...cards, ...cards];
  return (
    <div className="flex flex-col gap-3 overflow-hidden h-full">
      <div
        className={direction === "up" ? "animate-scroll-up" : "animate-scroll-down"}
        style={{ display: "flex", flexDirection: "column", gap: "12px" }}
      >
        {doubled.map((card, i) => (
          <FloatingCard key={`${card.title}-${i}`} {...card} />
        ))}
      </div>
    </div>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const col1 = CARDS.slice(0, 4);
  const col2 = CARDS.slice(4, 8);
  const col3 = CARDS.slice(8, 12);

  return (
    <div className="flex min-h-screen">
      {/* Left — Animated visual */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-[#08080a] items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#08080a_100%)]" />

        <div className="relative flex gap-3 h-[600px] -rotate-12 scale-[0.85] opacity-60">
          <ScrollColumn cards={col1} direction="up" />
          <ScrollColumn cards={col2} direction="down" />
          <ScrollColumn cards={col3} direction="up" />
        </div>

        {/* Overlay text */}
        <div className="absolute bottom-8 left-8 right-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
              <span className="text-[10px] font-bold text-primary">N</span>
            </div>
            <span className="text-[11px] font-semibold text-white/40 tracking-wide">Nizek Project</span>
          </div>
          <p className="text-[11px] text-white/20 max-w-xs leading-relaxed">
            Track tasks, manage contracts, and keep your team aligned — all in one place.
          </p>
        </div>
      </div>

      {/* Right — Auth form */}
      <div className="flex flex-col items-center justify-center w-full lg:w-[480px] lg:min-w-[480px] px-6 py-12 bg-background relative">
        <div className="w-full max-w-[360px] flex flex-col items-center">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">N</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">Nizek Project</span>
          </div>

          {/* Clerk form */}
          {children}

          {/* Footer */}
          <p className="mt-8 text-[10px] text-muted-foreground/50 text-center">
            Access is restricted to approved accounts only.
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground/30">
            nizek &middot; v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
