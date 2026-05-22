import { getProject, getProjectInvitations } from "@/actions/project";
import { getTasksByProject } from "@/actions/task";
import { getMeetingNotes } from "@/actions/meeting-note";
import { getAssets } from "@/actions/asset";
import { getTaskQuestions } from "@/actions/task-question";
import { getRoles } from "@/actions/role";
import { requireProjectMember } from "@/lib/auth";
import { getPermissionsFromRole, getAdminPermissions } from "@/lib/permissions";
import { ProjectDetailClient } from "./project-detail-client";
import type { KanbanTask } from "@/store/kanban";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const [tasks, notes, assets, questions, roles, invitations] = await Promise.all([
    getTasksByProject(projectId),
    getMeetingNotes(projectId),
    getAssets(projectId),
    getTaskQuestions(),
    getRoles(project.id),
    getProjectInvitations(project.id),
  ]);

  const { user, member } = await requireProjectMember(project.id);

  let userPermissions;
  if (user.systemRole === "ADMIN") {
    userPermissions = {
      canCreateTask: true,
      canModifyTask: true,
      canMoveTask: true,
      canDeleteTask: true,
      canDeclineTask: true,
      allowedStages: [] as string[],
      allowedTransitions: {} as Record<string, string[]>,
      isAdmin: true,
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

  const now = new Date();
  const isActive = project.contracts.some(
    (c) => new Date(c.startDate) <= now && new Date(c.endDate) >= now
  );

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
    />
  );
}
