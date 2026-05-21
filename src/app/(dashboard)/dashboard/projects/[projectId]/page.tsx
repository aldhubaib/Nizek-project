import { getProject, getProjectInvitations } from "@/actions/project";
import { getTasksByProject } from "@/actions/task";
import { getMeetingNotes } from "@/actions/meeting-note";
import { getAssets } from "@/actions/asset";
import { getTaskQuestions } from "@/actions/task-question";
import { getRoles } from "@/actions/role";
import { requireProjectMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  let userPermissions = {
    canCreateTask: member.role === "ADMIN",
    canModifyTask: member.role === "ADMIN",
    canMoveTask: member.role === "ADMIN",
    allowedStages: [] as string[],
    isAdmin: member.role === "ADMIN",
  };

  if (member.roleId) {
    const pRole = await prisma.projectRole.findUnique({
      where: { id: member.roleId },
    });
    if (pRole) {
      const allStages = [
        "NEW_REQUEST", "CLARIFICATION", "READY_FOR_DEV", "IN_DEVELOPMENT",
        "INTERNAL_REVIEW", "CLIENT_REVIEW", "READY_FOR_RELEASE", "DONE",
      ];
      let stages: string[] = allStages;
      if (pRole.allowedStages) {
        try { stages = JSON.parse(pRole.allowedStages); } catch { stages = allStages; }
      }
      userPermissions = {
        canCreateTask: pRole.canCreateTask,
        canModifyTask: pRole.canModifyTask,
        canMoveTask: pRole.canMoveTask,
        allowedStages: stages,
        isAdmin: pRole.isAdmin,
      };
    }
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
