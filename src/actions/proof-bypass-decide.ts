"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { logTaskActivity } from "@/lib/activity";
import { notifyRequesterInMailbox } from "@/lib/deliver-proof-bypass";
import type { ProofBypassPayload } from "@/lib/proof-bypass-payload";
import { publish, projectChannel } from "@/lib/centrifugo";
import { moveTask } from "@/actions/task";

async function canApproveBypass(projectId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { canBypassProof: true, projectRole: { select: { isAdmin: true } } },
  });
  return Boolean(member?.canBypassProof || member?.projectRole?.isAdmin);
}

async function loadPassForApprover(passId: string) {
  const pass = await prisma.proofBypassPass.findUnique({
    where: { id: passId },
    include: {
      task: { select: { id: true, projectId: true, title: true, taskNumber: true, taskType: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });
  if (!pass) throw new Error("Bypass request not found");
  const { user } = await requireProjectMember(pass.task.projectId);
  const allowed = await canApproveBypass(pass.task.projectId, user.id, user.systemRole === "ADMIN");
  if (!allowed) throw new Error("You cannot approve or reject this request");
  return { pass, user };
}

/** Already at or past review, so approving the bypass has nowhere to move it. */
const REVIEW_OR_LATER = new Set([
  "INTERNAL_REVIEW",
  "DONE",
  "COMPLETED",
  "SHIPPED",
]);

async function moveTaskToInternalReviewOnApprove(pass: {
  id: string;
  task: { id: string; projectId: string };
  requestedBy: { id: string };
}, approver: { id: string; name: string | null }) {
  const task = await prisma.task.findUnique({
    where: { id: pass.task.id },
    select: { id: true, stage: true, projectId: true },
  });
  if (!task) return;

  const proof = await prisma.proofOfWork.create({
    data: {
      taskId: task.id,
      createdById: pass.requestedBy.id,
      bypassedById: approver.id,
      bypassedAt: new Date(),
    },
  });

  await logTaskActivity({
    taskId: task.id,
    userId: pass.requestedBy.id,
    action: "proof_bypass",
    field: "bypass",
    newValue: approver.name ?? "manager",
  });

  if (REVIEW_OR_LATER.has(task.stage)) {
    await prisma.proofBypassPass.update({
      where: { id: pass.id },
      data: { status: "USED", usedAt: new Date() },
    });
    return;
  }

  const order = await prisma.task.count({
    where: { projectId: task.projectId, stage: "INTERNAL_REVIEW" },
  });
  const moved = await moveTask({
    taskId: task.id,
    stage: "INTERNAL_REVIEW",
    order,
    proofOfWorkId: proof.id,
  });
  if (!moved.success) {
    console.error("[proof bypass move]", moved.error);
    return;
  }

  await prisma.proofBypassPass.update({
    where: { id: pass.id },
    data: { status: "USED", usedAt: new Date() },
  });
}

async function decide(passId: string, status: "APPROVED" | "REJECTED") {
  const { pass, user } = await loadPassForApprover(passId);
  if (pass.status !== "PENDING") throw new Error("This request is no longer pending");

  await prisma.proofBypassPass.update({
    where: { id: pass.id },
    data: { status, approvedById: user.id, approvedAt: new Date() },
  });

  if (status === "APPROVED") {
    await moveTaskToInternalReviewOnApprove(pass, user);
  }

  const project = await prisma.project.findUnique({
    where: { id: pass.task.projectId },
    select: { name: true },
  });
  const payload: ProofBypassPayload = {
    passId: pass.id,
    taskId: pass.task.id,
    projectId: pass.task.projectId,
    projectName: project?.name ?? "Project",
    taskTitle: pass.task.title,
    taskNumber: pass.task.taskNumber,
    taskType: pass.task.taskType,
    status,
    requesterId: pass.requestedBy.id,
    requesterName: pass.requestedBy.name ?? "Someone",
    decidedByName: user.name ?? "Someone",
  };
  await notifyRequesterInMailbox(pass.id, payload, user.id);
  await publish(projectChannel(pass.task.projectId), {
    type: status === "APPROVED" ? "proof-bypass.approved" : "proof-bypass.rejected",
    passId: pass.id,
    taskId: pass.task.id,
    requesterId: pass.requestedBy.id,
    deciderId: user.id,
  });
  revalidatePath(`/dashboard/projects/${pass.task.projectId}`);
  revalidatePath(`/dashboard/projects/${pass.task.projectId}/bypass-requests`);
}

export async function approveProofBypass(passId: string): Promise<void> {
  await decide(passId, "APPROVED");
}

export async function rejectProofBypass(passId: string): Promise<void> {
  await decide(passId, "REJECTED");
}
