import { redirect } from "next/navigation";

/**
 * The overview is now the lower half of the dashboard rather than its own page.
 * This stays behind so old links and bookmarks land somewhere useful, carrying
 * the project filter across with them.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  redirect(
    project
      ? `/dashboard?project=${encodeURIComponent(project)}`
      : "/dashboard",
  );
}
