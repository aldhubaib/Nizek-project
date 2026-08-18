import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLongestInPipeline } from "@/actions/dashboard";
import { PipelineFullTable } from "@/components/dashboard/pipeline-full-table";
import { PageHeader } from "@/components/page-header";

const STAGE_FILTERS: Record<string, string[]> = {
  product: ["INTERNAL_REVIEW", "CLIENT_REVIEW"],
  dev: ["READY_FOR_DEV", "IN_DEVELOPMENT"],
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const stages = tab ? STAGE_FILTERS[tab] : undefined;
  const data = await getLongestInPipeline(stages);

  const backHref = tab ? `/dashboard?tab=${tab}` : "/dashboard";

  return (
    <div>
      <PageHeader>
        <Link
          href={backHref}
          className="flex items-center gap-xs text-muted-foreground hover:text-foreground transition-colors text-s"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <span className="text-border">|</span>
        <h1 className="text-s font-semibold">{tab === "product" ? "PM" : tab === "dev" ? "Dev" : ""} Longest in Stage By Task</h1>
        <span className="text-xs text-muted-foreground">({data.length} tasks)</span>
      </PageHeader>

      <div className="px-app py-6">
        <PipelineFullTable data={JSON.parse(JSON.stringify(data))} />
      </div>
    </div>
  );
}
