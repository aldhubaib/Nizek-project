import { notFound, redirect } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { isClientUser } from "@/lib/client-chat";
import { getProject } from "@/actions/project";
import { canCurrentUserBypassProof, listProofBypassRequests } from "@/actions/proof-of-work";
import { BypassRequestsClient } from "./bypass-requests-client";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function BypassRequestsPage({ params }: Props) {
  const { projectId } = await params;
  try {
    const [{ user }, project, requests, canDecide] = await Promise.all([
      requireProjectMember(projectId),
      getProject(projectId),
      listProofBypassRequests(projectId),
      canCurrentUserBypassProof(projectId),
    ]);
    if (isClientUser(user)) redirect("/dashboard/messages");
    return (
      <BypassRequestsClient
        projectId={project.id}
        projectName={project.name}
        requests={requests}
        canDecide={canDecide}
        currentUserId={user.id}
      />
    );
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }
}
