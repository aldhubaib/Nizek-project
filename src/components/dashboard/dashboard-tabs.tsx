"use client";

import { type ReactNode, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Package, Code, LayoutDashboard } from "lucide-react";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "product", label: "PM", icon: Package },
  { id: "dev", label: "Dev", icon: Code },
  { id: "management", label: "Management", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

interface Props {
  dashboard: ReactNode;
  management: ReactNode;
  product: ReactNode;
  dev: ReactNode;
}

export function DashboardTabs({ dashboard, management, product, dev }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "product";
  const active: TabId = VALID_TABS.has(rawTab) ? (rawTab as TabId) : "product";

  const setActive = useCallback(
    (tabId: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === "product") {
        params.delete("tab");
      } else {
        params.set("tab", tabId);
      }
      const qs = params.toString();
      router.replace(`/dashboard${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router],
  );

  const content: Record<TabId, ReactNode> = { dashboard, management, product, dev };

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
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-s font-medium transition-colors",
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
