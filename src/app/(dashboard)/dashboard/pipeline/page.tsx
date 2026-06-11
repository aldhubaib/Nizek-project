import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLongestInPipeline } from "@/actions/dashboard";
import { PipelineFullTable } from "@/components/dashboard/pipeline-full-table";

const STAGE_FILTERS: Record<string, string[]> = {
  product: ["INTERNAL_REVIEW"],
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
      <div className="h-12 flex items-center gap-3 px-6 pr-14 border-b border-border shrink-0">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <span className="text-border">|</span>
        <h1 className="text-sm font-semibold">Longest in Pipeline By Task</h1>
        <span className="text-[11px] text-muted-foreground">({data.length} tasks)</span>
      </div>

      <div className="px-6 py-6">
        <PipelineFullTable data={JSON.parse(JSON.stringify(data))} />
      </div>
    </div>
  );
}
