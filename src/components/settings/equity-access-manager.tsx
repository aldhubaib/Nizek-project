"use client";

import { useEffect, useState, useTransition } from "react";
import { PieChart, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  getEquityPermissionAdminData,
  setUserEquityAccess,
  type EquityMember,
} from "@/actions/equity";

/**
 * Admin settings: grant members access to the Equity module. Unlike audit
 * access there is no team dimension — equity is all-or-nothing, and admins get
 * it only by granting it to themselves.
 */
export function EquityAccessManager() {
  const [members, setMembers] = useState<EquityMember[]>([]);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [, startSaving] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getEquityPermissionAdminData();
      if (cancelled) return;
      setMembers(data.members);
      setAllowed(new Set(data.allowedUserIds));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (userId: string) => {
    const next = !allowed.has(userId);
    setAllowed((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(userId);
      else copy.delete(userId);
      return copy;
    });
    startSaving(async () => {
      await setUserEquityAccess(userId, next);
    });
  };

  const filtered = members.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PieChart className="h-4 w-4 text-muted-foreground" />
          Equity access
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Choose who can open the Equity module. It holds contracts, stakes and
          valuations, so access is off by default and admins are not included
          automatically — grant it explicitly, including to yourself.
        </p>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {loading ? (
        <p className="py-6 text-[12px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              {filtered.length} member{filtered.length === 1 ? "" : "s"}
            </span>
            <span>{allowed.size} with equity access</span>
          </div>
          <div className="divide-y divide-border/50">
            {filtered.map((m) => {
              const on = allowed.has(m.id);
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={m.imageUrl ?? undefined} />
                      <AvatarFallback className="text-[9px]">
                        {(m.name ?? m.email).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">
                        {m.name ?? m.email}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {m.email}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      on
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-accent/20",
                    )}
                  >
                    {on ? "Has access" : "No access"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
