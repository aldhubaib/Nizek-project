import { Construction } from "lucide-react";

import { EmptyState } from "@/next-ui/patterns/empty-state";
import { PageHeader } from "@/next-ui/patterns/page-header";

/** A section or record whose screen is not built here yet. */
function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState icon={Construction} title="Not built yet" description={`${title} is being rebuilt here and will arrive soon.`} />
    </div>
  );
}

export { ComingSoon };
