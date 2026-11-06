"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { notifyRequesterInMailbox } from "@/lib/deliver-proof-bypass";
import type { ProofBypassPayload } from "@/lib/proof-bypass-payload";
import { publish, projectChannel } from "@/lib/centrifugo";

/**
 * Declining a video request. Answering one the other way — by uploading the
 * video — lives in `uploadProofForRequest`; a request can no longer be waved
 * through without a video.
 */

async function canDecide(projectId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { canBypassProof: true, projectRole: { select: { isAdmin: true } } },
  });
  return Boolean(member?.canBypassProof || member?.projectRole?.isAdmin);
}

export async function rejectProofBypass(passId: string): Promise<void> {
  const pass = await prisma.proofBypassPass.findUnique({
    where: { id: passId },
    include: {
      task: { select: { id: true, projectId: true, title: true, taskNumber: true, taskType: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });
  if (!pass) throw new Error("Video request not found");
  const { user } = await requireProjectMember(pass.task.projectId);
  const allowed = await canDecide(pass.task.projectId, user.id, user.systemRole === "ADMIN");
  if (!allowed) throw new Error("You cannot decline this request");
  if (pass.status !== "PENDING") throw new Error("This request is no longer waiting");

  await prisma.proofBypassPass.update({
    where: { id: pass.id },
    data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date() },
  });

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
    status: "REJECTED",
    requesterId: pass.requestedBy.id,
    requesterName: pass.requestedBy.name ?? "Someone",
    decidedByName: user.name ?? "Someone",
  };
  await notifyRequesterInMailbox(pass.id, payload, user.id);
  await publish(projectChannel(pass.task.projectId), {
    type: "proof-bypass.rejected",
    passId: pass.id,
    taskId: pass.task.id,
    requesterId: pass.requestedBy.id,
    deciderId: user.id,
  });
  revalidatePath(`/dashboard/projects/${pass.task.projectId}`);
  revalidatePath(`/dashboard/projects/${pass.task.projectId}/bypass-requests`);
}
