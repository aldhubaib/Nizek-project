"use client";

import { type ReactNode, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CalendarDays, BarChart3, Package, Code } from "lucide-react";

const TABS = [
  { id: "daily", label: "Daily", icon: CalendarDays },
  { id: "management", label: "Management", icon: BarChart3 },
  { id: "product", label: "Product", icon: Package },
  { id: "dev", label: "Dev", icon: Code },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

interface Props {
  daily: ReactNode;
  management: ReactNode;
  product: ReactNode;
  dev: ReactNode;
}

export function DashboardTabs({ daily, management, product, dev }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "daily";
  const active: TabId = VALID_TABS.has(rawTab) ? (rawTab as TabId) : "daily";

  const setActive = useCallback(
    (tabId: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === "daily") {
        params.delete("tab");
      } else {
        params.set("tab", tabId);
      }
      const qs = params.toString();
      router.replace(`/dashboard${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router],
  );

  const content: Record<TabId, ReactNode> = { daily, management, product, dev };

  return (
    <div>
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5 w-fit mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                active === tab.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {content[active]}
      </div>
    </div>
  );
}
