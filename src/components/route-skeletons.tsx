import type { ReactNode } from "react";
import { PageHeader, PageName } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">{children}</div>
  );
}

export function DashboardHomeSkeleton() {
  return (
    <div>
      <PageHeader>
        <PageName>Dashboard</PageName>
      </PageHeader>
      <div className="px-app py-6 pb-16">
        <div className="mb-8 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-64 bg-muted/40" />
        </div>
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <CardShell key={i}>
              <Skeleton className="mb-3 h-8 w-8 rounded-lg" />
              <Skeleton className="mb-2 h-6 w-10" />
              <Skeleton className="h-3 w-16 bg-muted/40" />
            </CardShell>
          ))}
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <CardShell>
            <Skeleton className="mb-4 h-3.5 w-28" />
            <div className="flex items-center gap-6">
              <Skeleton className="size-[100px] rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24 bg-muted/40" />
                <Skeleton className="h-3 w-20 bg-muted/40" />
                <Skeleton className="h-3 w-28 bg-muted/40" />
              </div>
            </div>
          </CardShell>
          <CardShell>
            <Skeleton className="mb-4 h-3.5 w-32" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-xl bg-muted/40" />
              <Skeleton className="h-20 rounded-xl bg-muted/40" />
            </div>
          </CardShell>
        </div>
        <CardShell>
          <Skeleton className="mb-4 h-3.5 w-24" />
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-1.5">
                <Skeleton className="size-7 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-2.5 w-24 bg-muted/40" />
                </div>
              </div>
            ))}
          </div>
        </CardShell>
      </div>
    </div>
  );
}

export function ProjectsListSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader className="justify-between">
        <PageName>Projects</PageName>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </PageHeader>
      <div className="px-app py-l">
        <div className="grid grid-cols-1 gap-card sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/60 bg-card p-4"
            >
              <div className="mb-4 flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-20 bg-muted/40" />
                </div>
              </div>
              <Skeleton className="h-2 w-full rounded-full bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div>
      <PageHeader hasMenu className="relative w-full min-w-0">
        <div className="flex min-w-0 items-center gap-s">
          <Skeleton className="size-5 rounded bg-muted/40" />
          <Skeleton className="h-5 w-36" />
        </div>
      </PageHeader>
      <div className="hidden gap-s border-b border-border px-app py-s lg:flex">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full bg-muted/40" />
        ))}
      </div>
      <div className="px-app py-l">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/60 bg-card p-4"
            >
              <Skeleton className="mb-4 h-3 w-16 bg-muted/40" />
              <div className="space-y-2">
                <Skeleton className="h-16 rounded-xl bg-muted/40" />
                <Skeleton className="h-16 rounded-xl bg-muted/40" />
                <Skeleton className="h-16 rounded-xl bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <div className="flex h-dvh min-h-0 text-foreground">
      <aside className="flex w-full shrink-0 flex-col border-r border-border/60 lg:w-[320px]">
        <div className="flex h-14 items-center gap-3 border-b border-border/60 px-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="ml-auto size-8 rounded-full bg-muted/40" />
        </div>
        <div className="px-4 py-3">
          <Skeleton className="h-9 rounded-full bg-muted/40" />
        </div>
        <div className="flex-1 space-y-1 px-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
              <Skeleton className="size-10 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-40 bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      <div className="hidden min-w-0 flex-1 flex-col lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-20 bg-muted/40" />
          </div>
        </div>
        <div className="flex-1" />
        <div className="border-t border-border/60 p-3">
          <Skeleton className="h-11 rounded-full bg-muted/40" />
        </div>
      </div>
    </div>
  );
}

export function EquitySkeleton() {
  return (
    <div>
      <PageHeader hasMenu>
        <Skeleton className="size-4 rounded bg-muted/40" />
        <PageName className="flex-1">Equity</PageName>
      </PageHeader>
      <div className="px-app py-l">
        <div className="mb-l flex gap-s">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full bg-muted/40" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3"
            >
              <Skeleton className="size-9 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-2.5 w-24 bg-muted/40" />
              </div>
              <Skeleton className="h-3 w-12 bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VaultSkeleton() {
  return (
    <div>
      <PageHeader>
        <PageName>Vault</PageName>
      </PageHeader>
      <div className="px-app py-l">
        <Skeleton className="mb-l h-10 w-full rounded-xl bg-muted/40" />
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3"
            >
              <Skeleton className="size-9 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-20 bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div>
      <PageHeader>
        <PageName>Settings</PageName>
      </PageHeader>
      <div className="px-app py-l space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3"
          >
            <Skeleton className="size-8 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-40 bg-muted/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
