import { notFound } from "next/navigation";

import { ComingSoon } from "@/next-ui/patterns/coming-soon";
import { paneTitle } from "@/next-ui/panes/pane-registry";
import { entryFromHref } from "@/next-ui/panes/pane-url";

/**
 * Every section and record of the new UI that has no screen yet: the placeholder, in the main
 * pane. A path that is not a section or record of the new UI (a removed module, a typo) is not
 * a page.
 */
export default async function NextPlaceholderPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const entry = entryFromHref(`/next/${slug.join("/")}`);
  if (!entry) notFound();

  return <ComingSoon title={paneTitle(entry)} />;
}
