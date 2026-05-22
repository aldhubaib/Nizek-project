import { getProject, getProjectInvitations } from "@/actions/project";
import { getTasksByProject } from "@/actions/task";
import { getMeetingNotes } from "@/actions/meeting-note";
import { getAssets } from "@/actions/asset";
import { getTaskQuestions } from "@/actions/task-question";
import { getRoles } from "@/actions/role";
import { requireProjectMember } from "@/lib/auth";
import { getPermissionsFromRole, getAdminPermissions } from "@/lib/permissions";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { ProjectDetailClient } from "./project-detail-client";
import type { KanbanTask } from "@/store/kanban";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const [tasks, notes, assets, questions, invitations, roles] = await Promise.all([
    getTasksByProject(projectId),
    getMeetingNotes(projectId),
    getAssets(projectId),
    getTaskQuestions(),
    getProjectInvitations(project.id),
    getRoles(),
  ]);

  const { user, member } = await requireProjectMember(project.id);

  let userPermissions;
  if (user.systemRole === "ADMIN") {
    const adminPerms = getAdminPermissions();
    userPermissions = {
      ...adminPerms,
      allowedStages: [] as string[],
      systemRole: "ADMIN",
    };
  } else {
    const perms = getPermissionsFromRole(member.projectRole);
    userPermissions = {
      ...perms,
      allowedStages: [] as string[],
      systemRole: user.systemRole,
    };
  }

  const activeContract = getActiveContract(project.contracts);
  const isActive = !!activeContract;
  const isAdmin = user.systemRole === "ADMIN";
  const allowedTaskTypes = activeContract
    ? getAllowedTaskTypes(activeContract.contractType, isAdmin)
    : [];

  return (
    <ProjectDetailClient
      project={project}
      tasks={tasks as unknown as KanbanTask[]}
      notes={notes}
      assets={assets}
      userRole={member.role}
      userPermissions={userPermissions}
      isActive={isActive}
      questions={questions}
      roles={roles}
      members={project.members}
      currentUserId={user.id}
      invitations={invitations}
      allowedTaskTypes={allowedTaskTypes}
      activeContractType={activeContract?.contractType ?? null}
    />
  );
}
