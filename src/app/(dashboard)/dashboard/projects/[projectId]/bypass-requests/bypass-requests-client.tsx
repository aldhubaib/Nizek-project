"use client";

import { useRouter } from "next/navigation";
import type { ProofBypassRequest } from "@/actions/proof-of-work";
import { PageHeader, PageBackButton } from "@/components/page-header";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { BypassRequestList } from "@/components/project/bypass-request-list";

export function BypassRequestsClient({
  projectId,
  projectName,
  requests,
  canDecide,
  currentUserId,
}: {
  projectId: string;
  projectName: string;
  requests: ProofBypassRequest[];
  canDecide: boolean;
  currentUserId: string;
}) {
  const router = useRouter();

  return (
    <div>
      <PageHeader>
        <PageBackButton
          href={`/dashboard/projects/${projectId}`}
          label="Back to project"
        />
        <PageBreadcrumb
          items={[
            { label: "Projects", href: "/dashboard/projects" },
            {
              label: projectName,
              href: `/dashboard/projects/${projectId}`,
            },
            { label: "Video bypass requests" },
          ]}
        />
      </PageHeader>

      <div className="mx-auto max-w-3xl px-app py-6">
        <BypassRequestList
          requests={requests}
          canDecide={canDecide}
          currentUserId={currentUserId}
          onOpenTask={(taskId) =>
            router.push(`/dashboard/projects/${projectId}/tasks/${taskId}`)
          }
        />
      </div>
    </div>
  );
}
