"use client";

import { Construction, ShieldUser } from "lucide-react";

import { RecordMenu, RecordRow, SectionHeader } from "@/next-ui/blocks";
import { useIsAdmin } from "@/next-ui/lib/viewer";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { ADMIN_ITEM, ADMIN_NAV, ADMIN_NAV_ITEMS, type NavItem } from "@/next-ui/shell/nav";

/**
 * The administrator's area. Without a view it is the index: every page of the Administrator
 * menu, grouped as the menu groups them, each with a line on what it holds. With a view it is
 * that page — the ones not rebuilt yet say so. System admins only.
 */
export function AdminScreen({ view }: { view?: string }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <>
        <PageHeader title={ADMIN_ITEM.title} />
        <EmptyState icon={ShieldUser} title="Administrators only" description="This area is for system administrators." />
      </>
    );
  }
  if (!view) return <AdminIndex />;

  const item = ADMIN_NAV_ITEMS.find((i) => i.href === `${ADMIN_ITEM.href}/${view}`);
  if (!item) {
    return (
      <>
        <PageHeader title={ADMIN_ITEM.title} />
        <EmptyState icon={ShieldUser} title="No such page" description="The Administrator menu has no page by that name." />
      </>
    );
  }
  return (
    <>
      <PageHeader title={`${item.title} · ${ADMIN_ITEM.title}`} />
      <div className="flex flex-col gap-6">
        <SectionHeader title={item.title} description={item.description} />
        <EmptyState icon={Construction} title="Not built yet" description={`${item.title} is being rebuilt here and will arrive soon.`} />
      </div>
    </>
  );
}

function AdminIndex() {
  return (
    <>
      <PageHeader title={ADMIN_ITEM.title} />
      <div className="flex flex-col gap-8" data-testid="admin-index">
        {ADMIN_NAV.map((group) => (
          <section key={group.label} className="flex flex-col gap-3" aria-label={group.label}>
            <SectionHeader as="h3" title={group.label} />
            <div className="flex flex-col gap-2" role="list">
              {group.items.map((item) => (
                <AdminRow key={item.href} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function AdminRow({ item }: { item: NavItem }) {
  return (
    <RecordRow
      href={item.href}
      leading={
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <item.icon className="size-4" />
        </span>
      }
      title={item.title}
      description={item.description}
      menu={<RecordMenu href={item.href} />}
    />
  );
}
