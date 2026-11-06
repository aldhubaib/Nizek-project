const PAYLOAD_PREFIX = "<!--proof-bypass:";

export type ProofBypassPayload = {
  passId: string;
  taskId: string;
  projectId: string;
  projectName: string;
  taskTitle: string;
  taskNumber: number;
  taskType: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requesterId: string;
  requesterName: string;
  decidedByName?: string | null;
};

export function encodeProofBypassBody(payload: ProofBypassPayload): string {
  return `${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeProofBypassPayload(body: string): ProofBypassPayload | null {
  const idx = body.indexOf(PAYLOAD_PREFIX);
  if (idx === -1) return null;
  const start = idx + PAYLOAD_PREFIX.length;
  const raw = body.slice(start);
  const end = raw.lastIndexOf("}");
  if (end === -1) return null;
  try {
    return JSON.parse(raw.slice(0, end + 1)) as ProofBypassPayload;
  } catch {
    return null;
  }
}

export function isProofBypassMessage(kind: string): boolean {
  return kind === "proof_bypass";
}

/**
 * The one-line preview of a request card. A request is for someone assigned to
 * record the proof video on the requester's behalf; "approved" means that video
 * was uploaded and the task moved on.
 */
export function proofBypassPreview(payload: ProofBypassPayload): string {
  if (payload.status === "APPROVED") return "Proof video uploaded";
  if (payload.status === "REJECTED") return "Video request declined";
  return "Asked for a proof video to be uploaded";
}

export function proofBypassTaskUrl(payload: ProofBypassPayload): string {
  return `/dashboard/projects/${payload.projectId}/tasks/${payload.taskId}`;
}
