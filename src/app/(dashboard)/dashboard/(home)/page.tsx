import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, PageName } from "@/components/page-header";
import { getAuditAccess } from "@/actions/audit";
import { getManagerOverview } from "@/actions/overview";
import { DeliverySection } from "../overview/overview-client";
import { DashboardClient } from "../dashboard-client";

/**
 * The dashboard, in two halves.
 *
 * Everyone gets the personal half — their tasks, their sprints, their
 * deadlines. Anyone who can audit gets the delivery half underneath it, which
 * is the same portfolio view the audit module is gated on. They are one page
 * rather than two because a manager was otherwise reading their own tasks in
 * one place and everyone else's work in another.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  if (isClientUser(user)) redirect("/dashboard/messages");

  const userId = user.id;
  const now = new Date();

  const [{ project }, access] = await Promise.all([
    searchParams,
    getAuditAccess(),
  ]);

  const [
    myTasks,
    unreadCount,
    myProjects,
    activeSprints,
    upcomingDeadlines,
    overview,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        archivedAt: null,
        stage: { in: ["TODO", "IN_DEVELOPMENT", "INTERNAL_REVIEW"] },
      },
      select: {
        id: true,
        title: true,
        taskNumber: true,
        taskType: true,
        stage: true,
        estimatedMinutes: true,
        updatedAt: true,
        projectId: true,
        project: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),

    prisma.notification.count({
      where: { recipientId: userId, read: false },
    }),

    prisma.projectMember.findMany({
      where: { userId },
      select: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            _count: {
              select: {
                tasks: { where: { archivedAt: null, stage: { not: "DONE" } } },
              },
            },
            sprints: {
              where: { status: "ACTIVE" },
              select: {
                id: true,
                name: true,
                endDate: true,
                _count: { select: { tasks: true } },
              },
              take: 1,
            },
          },
        },
      },
    }),

    prisma.sprint.findMany({
      where: {
        status: "ACTIVE",
        project: { members: { some: { userId } } },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        project: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { endDate: "asc" },
    }),

    prisma.meetingNote.findMany({
      where: {
        noteType: "DEADLINE",
        completedAt: null,
        dueDate: { gte: now },
        project: { members: { some: { userId } } },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        projectId: true,
        project: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),

    access.canAudit ? getManagerOverview(project) : Promise.resolve(null),
  ]);

  const stageBreakdown: Record<string, number> = {};
  for (const t of myTasks) {
    stageBreakdown[t.stage] = (stageBreakdown[t.stage] ?? 0) + 1;
  }

  const projects = myProjects.map((pm) => ({
    id: pm.project.id,
    name: pm.project.name,
    logoUrl: pm.project.logoUrl,
    openTasks: pm.project._count.tasks,
    activeSprint: pm.project.sprints[0]
      ? {
          name: pm.project.sprints[0].name,
          endDate: pm.project.sprints[0].endDate.toISOString(),
          taskCount: pm.project.sprints[0]._count.tasks,
        }
      : null,
  }));

  return (
    <div>
      <PageHeader>
        <PageName>Dashboard</PageName>
      </PageHeader>

      <div className="px-app flex flex-col gap-6 py-6 pb-16">
        <DashboardClient
          userName={user.name || "there"}
          unreadCount={unreadCount}
          nowIso={now.toISOString()}
          myTasks={myTasks.map((t) => ({
            ...t,
            taskType: t.taskType as string,
            updatedAt: t.updatedAt.toISOString(),
            projectName: t.project.name,
          }))}
          stageBreakdown={stageBreakdown}
          projects={projects}
          activeSprints={activeSprints.map((s) => ({
            ...s,
            startDate: s.startDate.toISOString(),
            endDate: s.endDate.toISOString(),
            projectName: s.project.name,
            projectId: s.project.id,
            taskCount: s._count.tasks,
          }))}
          upcomingDeadlines={upcomingDeadlines.map((d) => ({
            ...d,
            dueDate: d.dueDate!.toISOString(),
            projectName: d.project.name,
          }))}
        />

        {overview && <DeliverySection overview={overview} />}
      </div>
    </div>
  );
}
