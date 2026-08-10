import { getProject } from "@/actions/project";
import { getTasksByProject } from "@/actions/task";
import { getTaskQuestions } from "@/actions/task-question";
import { requireProjectMember } from "@/lib/auth";
import { getPermissionsFromRole, getAdminPermissions } from "@/lib/permissions";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { isDeadlineTestProjectByName } from "@/lib/deadline-reminders";
import { isProjectAccessError } from "@/lib/project-access";
import { canAccessProjectVault } from "@/lib/vault-access";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "./project-detail-client";
import type { KanbanTask } from "@/store/kanban";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;

  const [project, { user, member }, tasks, questions] = await Promise.all([
    getProject(projectId),
    requireProjectMember(projectId),
    getTasksByProject(projectId),
    getTaskQuestions(),
  ]).catch((err): never => {
    if (isProjectAccessError(err)) notFound();
    throw err;
  });

  const canAccessVault = await canAccessProjectVault(user.id, projectId);

  const isSystemAdmin = user.systemRole === "ADMIN";
  const isProjectAdmin = member.projectRole?.isAdmin ?? false;
  const canInviteMembers = isSystemAdmin || isProjectAdmin || member.canInviteMembers;
  const canInviteClients = isSystemAdmin || isProjectAdmin || member.canInviteClients;

  let userPermissions;
  if (isSystemAdmin) {
    const adminPerms = getAdminPermissions();
    userPermissions = {
      ...adminPerms,
      allowedStages: [] as string[],
      systemRole: "ADMIN",
      canInviteMembers: true,
      canInviteClients: true,
    };
  } else {
    const perms = getPermissionsFromRole(member.projectRole);
    userPermissions = {
      ...perms,
      allowedStages: [] as string[],
      systemRole: user.systemRole,
      canInviteMembers,
      canInviteClients,
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
      userRole={member.role}
      userPermissions={userPermissions}
      isActive={isActive}
      questions={questions}
      members={project.members}
      currentUserId={user.id}
      isSystemAdmin={isSystemAdmin}
      isDeadlineTestProject={isDeadlineTestProjectByName(project.name)}
      allowedTaskTypes={allowedTaskTypes}
      activeContractType={activeContract?.contractType ?? null}
      canAccessVault={canAccessVault}
    />
  );
}
