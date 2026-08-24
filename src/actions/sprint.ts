"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { addWorkingDays, startOfLocalDay } from "@/lib/working-days";
import type { RoadmapStatus } from "@/lib/roadmap-status";

function sprintName(n: number): string {
  return `Sprint ${String(n).padStart(2, "0")}`;
}

export async function getSprints(projectId: string) {
  await requireProjectMember(projectId);

  return prisma.sprint.findMany({
    where: { projectId },
    include: {
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSprintWithItems(sprintId: string) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    include: {
      items: {
        include: {
          task: {
            include: {
              assignee: { select: { id: true, name: true, imageUrl: true } },
              createdBy: { select: { id: true, name: true, imageUrl: true } },
            },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  await requireProjectMember(sprint.projectId);
  return sprint;
}

export async function createSprint(projectId: string) {
  const { member } = await requireProjectMember(projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create sprints");

  const count = await prisma.sprint.count({ where: { projectId } });
  const name = sprintName(count + 1);

  const sprint = await prisma.sprint.create({
    data: {
      name,
      projectId,
    },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return sprint;
}

export async function updateSprint(data: {
  sprintId: string;
  name?: string;
  workingDays?: number | null;
}) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: data.sprintId },
    select: { projectId: true, status: true },
  });

  const { member } = await requireProjectMember(sprint.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot update sprints");

  await prisma.sprint.update({
    where: { id: data.sprintId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.workingDays !== undefined && { workingDays: data.workingDays }),
    },
  });

  revalidatePath(`/dashboard/projects/${sprint.projectId}`);
}

export async function startSprint(sprintId: string, workingDays: number) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    select: { projectId: true, status: true },
  });

  if (sprint.status !== "PLANNING") {
    throw new Error("Only sprints in PLANNING status can be started");
  }

  const { member } = await requireProjectMember(sprint.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot start sprints");

  const active = await prisma.sprint.count({
    where: { projectId: sprint.projectId, status: "ACTIVE" },
  });
  if (active > 0) {
    throw new Error("Another sprint is already active. Stop it before starting a new one.");
  }

  if (!Number.isInteger(workingDays) || workingDays < 1) {
    throw new Error("Working days must be at least 1");
  }

  const startedAt = startOfLocalDay();
  const dueDate = addWorkingDays(startedAt, workingDays);

  await prisma.sprint.update({
    where: { id: sprintId },
    data: {
      status: "ACTIVE",
      workingDays,
      startedAt,
      dueDate,
    },
  });

  revalidatePath(`/dashboard/projects/${sprint.projectId}`);
}

export async function stopSprint(sprintId: string) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    select: { projectId: true, status: true },
  });

  if (sprint.status !== "ACTIVE") {
    throw new Error("Only active sprints can be stopped");
  }

  const { member } = await requireProjectMember(sprint.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot stop sprints");

  await prisma.sprint.update({
    where: { id: sprintId },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
    },
  });

  revalidatePath(`/dashboard/projects/${sprint.projectId}`);
}

export async function addTaskToSprint(sprintId: string, taskId: string) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    select: { projectId: true, status: true },
  });

  const { member } = await requireProjectMember(sprint.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot add tasks to sprints");

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { projectId: true },
  });

  if (task.projectId !== sprint.projectId) {
    throw new Error("Task and sprint must belong to the same project");
  }

  const maxOrder = await prisma.sprintItem.aggregate({
    where: { sprintId },
    _max: { order: true },
  });

  await prisma.sprintItem.create({
    data: {
      sprintId,
      taskId,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });

  revalidatePath(`/dashboard/projects/${sprint.projectId}`);
}

export async function removeTaskFromSprint(sprintId: string, taskId: string) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    select: { projectId: true },
  });

  const { member } = await requireProjectMember(sprint.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot remove tasks from sprints");

  await prisma.sprintItem.deleteMany({
    where: { sprintId, taskId },
  });

  revalidatePath(`/dashboard/projects/${sprint.projectId}`);
}

export async function moveSprintItem(
  sprintId: string,
  taskId: string,
  newStatus: RoadmapStatus,
) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    select: { projectId: true },
  });

  const { member } = await requireProjectMember(sprint.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot move sprint items");

  await prisma.sprintItem.updateMany({
    where: { sprintId, taskId },
    data: { status: newStatus },
  });

  revalidatePath(`/dashboard/projects/${sprint.projectId}`);
}

export async function deleteSprint(sprintId: string) {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    select: { projectId: true, status: true },
  });

  const { member } = await requireProjectMember(sprint.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot delete sprints");

  if (sprint.status === "ACTIVE") {
    throw new Error("Stop the sprint before deleting it");
  }

  await prisma.sprint.delete({ where: { id: sprintId } });

  revalidatePath(`/dashboard/projects/${sprint.projectId}`);
}

export async function getProjectTasksForSprintPicker(
  projectId: string,
  sprintId: string,
) {
  await requireProjectMember(projectId);

  const existingItems = await prisma.sprintItem.findMany({
    where: { sprintId },
    select: { taskId: true },
  });
  const excludeIds = new Set(existingItems.map((i) => i.taskId));

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      archivedAt: null,
      id: { notIn: [...excludeIds] },
    },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      stage: true,
      taskType: true,
      priority: true,
      assignee: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: { taskNumber: "desc" },
    take: 100,
  });

  return tasks;
}
