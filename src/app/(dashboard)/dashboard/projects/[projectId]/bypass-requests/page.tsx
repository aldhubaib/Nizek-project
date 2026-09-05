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
  // Only the loading is guarded. React renders the component after this
  // function has returned, so a catch around the JSX would never see the
  // errors it looks like it is catching.
  let loaded;
  try {
    loaded = await Promise.all([
      requireProjectMember(projectId),
      getProject(projectId),
      listProofBypassRequests(projectId),
      canCurrentUserBypassProof(projectId),
    ]);
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }

  const [{ user }, project, requests, canDecide] = loaded;
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
}
