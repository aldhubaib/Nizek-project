"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays, BarChart3, Package, Code } from "lucide-react";

const TABS = [
  { id: "daily", label: "Daily", icon: CalendarDays },
  { id: "management", label: "Management", icon: BarChart3 },
  { id: "product", label: "Product", icon: Package },
  { id: "dev", label: "Dev", icon: Code },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  daily: ReactNode;
  management: ReactNode;
  product: ReactNode;
  dev: ReactNode;
}

export function DashboardTabs({ daily, management, product, dev }: Props) {
  const [active, setActive] = useState<TabId>("daily");

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
