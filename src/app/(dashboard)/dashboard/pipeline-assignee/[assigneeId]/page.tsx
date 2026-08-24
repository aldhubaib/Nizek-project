import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { getLongestInPipeline } from "@/actions/dashboard";
import { PipelineFullTable } from "@/components/dashboard/pipeline-full-table";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

const STAGE_FILTERS: Record<string, string[]> = {
  product: ["INTERNAL_REVIEW"],
  dev: ["IN_DEVELOPMENT"],
};

export default async function AssigneeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ assigneeId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { assigneeId } = await params;
  const { tab } = await searchParams;
  const stages = tab ? STAGE_FILTERS[tab] : undefined;
  const data = await getLongestInPipeline(stages, assigneeId);

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { name: true, imageUrl: true },
  });

  const backHref = tab
    ? `/dashboard/pipeline-assignee?tab=${tab}`
    : "/dashboard/pipeline-assignee";

  return (
    <div>
      <PageHeader>
        <Link
          href={backHref}
          className="flex items-center gap-xs text-muted-foreground hover:text-foreground transition-colors text-s"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <span className="text-border">|</span>
        <div className="flex items-center gap-s">
          {assignee?.imageUrl ? (
            <img
              src={assignee.imageUrl}
              alt={assignee.name ?? ""}
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs font-semibold text-muted-foreground">
                {(assignee?.name ?? "?").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="text-s font-semibold">
            {assignee?.name ?? "Unknown User"}
          </h1>
          <span className="text-xs text-muted-foreground">
            ({data.length} {data.length === 1 ? "task" : "tasks"} &gt; {tab === "product" ? "1" : "2"}d in stage)
          </span>
        </div>
      </PageHeader>

      <div className="px-app py-6">
        <PipelineFullTable data={JSON.parse(JSON.stringify(data))} />
      </div>
    </div>
  );
}
