"use client";

import { useEffect, useState, useTransition } from "react";
import { KeyRound, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  getVaultPermissionAdminData,
  setUserVaultProjects,
  type VaultMember,
} from "@/actions/vault";

/**
 * Admin settings: grant members Vault access per project. Separate from project
 * team membership — passwords stay behind an explicit grant.
 */
export function VaultAccessManager() {
  const [members, setMembers] = useState<VaultMember[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [grants, setGrants] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [, startSaving] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getVaultPermissionAdminData();
      if (cancelled) return;
      setMembers(data.members);
      setProjects(data.projects);
      setGrants(new Map(data.grants.map((g) => [g.userId, g.projectIds])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (userId: string, projectId: string) => {
    const current = grants.get(userId) ?? [];
    const next = current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId];

    setGrants((prev) => {
      const copy = new Map(prev);
      copy.set(userId, next);
      return copy;
    });
    startSaving(async () => {
      await setUserVaultProjects(userId, next);
    });
  };

  const filtered = members.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  });

  const grantedCount = [...grants.values()].filter((p) => p.length > 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-s font-semibold">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Vault access
        </h2>
        <p className="mt-1 text-s text-muted-foreground">
          Choose who can open each project&apos;s Vault (passwords, emails, API
          keys). This is separate from the project Team — grant it explicitly,
          including to yourself. Deleted credentials go to Trash; only admins
          can see, restore, or permanently delete them.
        </p>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members"
          className="h-9 ps-8 text-s"
        />
      </div>

      {loading ? (
        <p className="py-6 text-s text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="py-6 text-s text-muted-foreground">
          Create a project first, then grant Vault access here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
            <span>
              {filtered.length} member{filtered.length === 1 ? "" : "s"}
            </span>
            <span>{grantedCount} with vault access</span>
          </div>
          <div className="divide-y divide-border/50">
            {filtered.map((m) => {
              const userProjects = grants.get(m.id) ?? [];
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={m.imageUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {(m.name ?? m.email).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-s font-medium">
                        {m.name ?? m.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex max-w-md flex-wrap gap-1.5">
                    {projects.map((p) => {
                      const on = userProjects.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggle(m.id, p.id)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            on
                              ? "border-primary/40 bg-primary/15 text-primary"
                              : "border-border bg-card text-muted-foreground hover:bg-accent/20",
                          )}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
