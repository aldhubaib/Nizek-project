"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { activeProjectFilter } from "@/lib/project-filters";
import {
  ACTIVE_STAGES,
  STAGE_LABELS,
  type AuditFlagType,
  classifyStageDuration,
  isRejectedFlag,
  severityRank,
  compareAuditItems,
  buildOwnershipTimeline,
  blameCandidates,
  msToHours,
  utcDateOnly,
  CLIENT_INPUT_WAIT_MS,
  type OwnershipEvent,
} from "@/lib/audit-flags";

// ─── Access ─────────────────────────────────────────────

export type AuditAccess = {
  canAudit: boolean;
  isAdmin: boolean;
  userId: string;
  teams: { id: string; name: string }[];
};

/**
 * Which teams the current user may audit. Admins implicitly get every team;
 * everyone else needs AuditPermission grants.
 */
export async function getAuditAccess(): Promise<AuditAccess> {
  const user = await requireUser();

  if (user.systemRole === "ADMIN") {
    const teams = await prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return { canAudit: true, isAdmin: true, userId: user.id, teams };
  }

  const grants = await prisma.auditPermission.findMany({
    where: { userId: user.id },
    select: { team: { select: { id: true, name: true } } },
    orderBy: { team: { name: "asc" } },
  });

  return {
    canAudit: grants.length > 0,
    isAdmin: false,
    userId: user.id,
    teams: grants.map((g) => g.team),
  };
}

async function requireAuditor() {
  const access = await getAuditAccess();
  if (!access.canAudit) throw new Error("No audit permission");
  const user = await requireUser();
  return { user, access };
}

// ─── Reports list ───────────────────────────────────────

export type AuditReportRow = {
  id: string;
  auditDate: string;
  teamNames: string[];
  status: string;
  submittedAt: string | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  totalItems: number;
  decidedItems: number;
  blamedItems: number;
  excusedItems: number;
};

/** Own reports; admins see everyone's (the manager-compliance view). */
export async function listAuditReports(): Promise<AuditReportRow[]> {
  const { user, access } = await requireAuditor();

  const audits = await prisma.taskAudit.findMany({
    where: access.isAdmin ? {} : { createdById: user.id },
    select: {
      id: true,
      auditDate: true,
      teamNames: true,
      status: true,
      submittedAt: true,
      createdBy: { select: { id: true, name: true, imageUrl: true } },
      items: { select: { verdict: true } },
    },
    orderBy: { auditDate: "desc" },
    take: 120,
  });

  return audits.map((a) => ({
    id: a.id,
    auditDate: a.auditDate.toISOString(),
    teamNames: a.teamNames,
    status: a.status,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    createdBy: a.createdBy,
    totalItems: a.items.length,
    decidedItems: a.items.filter((i) => i.verdict !== "pending").length,
    blamedItems: a.items.filter((i) => i.verdict === "blamed").length,
    excusedItems: a.items.filter((i) => i.verdict === "excused").length,
  }));
}

// ─── Flag snapshot ──────────────────────────────────────

type SnapshotItem = {
  taskId: string | null;
  noteId: string | null;
  flagType: AuditFlagType;
  severity: number;
  title: string;
  taskNumber: number | null;
  projectId: string;
  projectName: string;
  teamName: string | null;
  stage: string | null;
  stageLabel: string | null;
  stageHours: number | null;
  declineCount: number | null;
  dueInDays: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
};


/**
 * Same monitors as the dashboard, snapshotted: critical late, rejected,
 * overdue deadlines, warn late, awaiting client input. One item per task —
 * the most severe flag wins, decline counts ride along as context.
 */
async function collectFlaggedItems(teamIds: string[]): Promise<SnapshotItem[]> {
  const now = new Date();
  const projectWhere = {
    teamId: { in: teamIds },
    ...activeProjectFilter(),
  };

  const [stuckTasks, declines, clientAnswers, deadlineNotes] = await Promise.all([
    prisma.task.findMany({
      where: {
        stage: { in: [...ACTIVE_STAGES] },
        startedAt: { not: null },
        archivedAt: null,
        project: projectWhere,
      },
      select: {
        id: true,
        title: true,
        taskNumber: true,
        stage: true,
        assignee: { select: { id: true, name: true } },
        project: {
          select: { id: true, name: true, team: { select: { name: true } } },
        },
        stageLogs: {
          where: { exitedAt: null },
          orderBy: { enteredAt: "desc" },
          take: 1,
          select: { enteredAt: true },
        },
      },
      take: 300,
    }),
    prisma.taskActivity.findMany({
      where: {
        action: "declined",
        task: { stage: { not: "DONE" }, archivedAt: null, project: projectWhere },
      },
      select: {
        taskId: true,
        task: {
          select: {
            id: true,
            title: true,
            taskNumber: true,
            stage: true,
            assignee: { select: { id: true, name: true } },
            project: {
              select: { id: true, name: true, team: { select: { name: true } } },
            },
          },
        },
      },
      take: 500,
    }),
    prisma.taskAnswer.findMany({
      where: {
        question: { type: "client" },
        task: {
          stage: { in: ["NEW_REQUEST", "CLARIFICATION"] },
          archivedAt: null,
          project: projectWhere,
        },
      },
      select: {
        answer: true,
        task: {
          select: {
            id: true,
            title: true,
            taskNumber: true,
            stage: true,
            assignee: { select: { id: true, name: true } },
            project: {
              select: { id: true, name: true, team: { select: { name: true } } },
            },
            stageLogs: {
              where: { exitedAt: null },
              orderBy: { enteredAt: "desc" },
              take: 1,
              select: { enteredAt: true },
            },
          },
        },
      },
      take: 300,
    }),
    prisma.meetingNote.findMany({
      where: {
        noteType: "DEADLINE",
        completedAt: null,
        dueDate: { not: null, lt: now },
        project: projectWhere,
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        project: {
          select: { id: true, name: true, team: { select: { name: true } } },
        },
        author: { select: { id: true, name: true } },
      },
      take: 200,
    }),
  ]);

  const byTask = new Map<string, SnapshotItem>();

  const upsertTaskItem = (item: SnapshotItem) => {
    const key = item.taskId!;
    const existing = byTask.get(key);
    if (!existing) {
      byTask.set(key, item);
      return;
    }
    // Keep the most severe flag but merge context from the other flags.
    const winner = item.severity < existing.severity ? item : existing;
    const loser = winner === item ? existing : item;
    byTask.set(key, {
      ...winner,
      declineCount: winner.declineCount ?? loser.declineCount,
      stageHours: winner.stageHours ?? loser.stageHours,
    });
  };

  // 1 + 4: stage-duration flags (critical > 7d, warn > 2d).
  for (const t of stuckTasks) {
    const log = t.stageLogs[0];
    if (!log) continue;
    const stageMs = now.getTime() - new Date(log.enteredAt).getTime();
    const flag = classifyStageDuration(stageMs);
    if (!flag) continue;
    upsertTaskItem({
      taskId: t.id,
      noteId: null,
      flagType: flag,
      severity: severityRank(flag),
      title: t.title,
      taskNumber: t.taskNumber,
      projectId: t.project.id,
      projectName: t.project.name,
      teamName: t.project.team?.name ?? null,
      stage: t.stage,
      stageLabel: STAGE_LABELS[t.stage] ?? t.stage,
      stageHours: msToHours(stageMs),
      declineCount: null,
      dueInDays: null,
      assigneeId: t.assignee?.id ?? null,
      assigneeName: t.assignee?.name ?? null,
    });
  }

  // 2: rejected (declined more than twice, dashboard rule).
  const declineCountByTask = new Map<string, { count: number; task: (typeof declines)[0]["task"] }>();
  for (const d of declines) {
    const entry = declineCountByTask.get(d.taskId);
    if (entry) entry.count++;
    else declineCountByTask.set(d.taskId, { count: 1, task: d.task });
  }
  for (const { count, task } of declineCountByTask.values()) {
    if (!isRejectedFlag(count)) continue;
    upsertTaskItem({
      taskId: task.id,
      noteId: null,
      flagType: "rejected",
      severity: severityRank("rejected"),
      title: task.title,
      taskNumber: task.taskNumber,
      projectId: task.project.id,
      projectName: task.project.name,
      teamName: task.project.team?.name ?? null,
      stage: task.stage,
      stageLabel: STAGE_LABELS[task.stage] ?? task.stage,
      stageHours: null,
      declineCount: count,
      dueInDays: null,
      assigneeId: task.assignee?.id ?? null,
      assigneeName: task.assignee?.name ?? null,
    });
  }

  // 5: awaiting client input for > 2 days.
  for (const a of clientAnswers) {
    try {
      const parsed = JSON.parse(a.answer);
      if (!parsed.needed || parsed.completed) continue;
    } catch {
      continue;
    }
    const log = a.task.stageLogs[0];
    const waitingMs = log ? now.getTime() - new Date(log.enteredAt).getTime() : 0;
    if (waitingMs < CLIENT_INPUT_WAIT_MS) continue;
    upsertTaskItem({
      taskId: a.task.id,
      noteId: null,
      flagType: "client_input",
      severity: severityRank("client_input"),
      title: a.task.title,
      taskNumber: a.task.taskNumber,
      projectId: a.task.project.id,
      projectName: a.task.project.name,
      teamName: a.task.project.team?.name ?? null,
      stage: a.task.stage,
      stageLabel: STAGE_LABELS[a.task.stage] ?? a.task.stage,
      stageHours: msToHours(waitingMs),
      declineCount: null,
      dueInDays: null,
      assigneeId: a.task.assignee?.id ?? null,
      assigneeName: a.task.assignee?.name ?? null,
    });
  }

  const items = [...byTask.values()];

  // 3: overdue deadline notes (blame pool = mentioned users + author).
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (const n of deadlineNotes) {
    if (!n.dueDate) continue;
    const dueInDays = Math.ceil((n.dueDate.getTime() - now.getTime()) / DAY_MS);
    items.push({
      taskId: null,
      noteId: n.id,
      flagType: "deadline_overdue",
      severity: severityRank("deadline_overdue"),
      title: n.title,
      taskNumber: null,
      projectId: n.project.id,
      projectName: n.project.name,
      teamName: n.project.team?.name ?? null,
      stage: null,
      stageLabel: null,
      stageHours: null,
      declineCount: null,
      dueInDays,
      assigneeId: n.author.id,
      assigneeName: n.author.name,
    });
  }

  return items.sort(compareAuditItems);
}

// ─── Create / resume ────────────────────────────────────

export async function createTodayAudit(
  teamIds: string[],
): Promise<{ id: string; resumed: boolean }> {
  const { user, access } = await requireAuditor();

  const allowedIds = new Set(access.teams.map((t) => t.id));
  const selected = teamIds.filter((id) => allowedIds.has(id));
  if (selected.length === 0) throw new Error("Select at least one team");

  const today = utcDateOnly(new Date());

  const existing = await prisma.taskAudit.findUnique({
    where: { createdById_auditDate: { createdById: user.id, auditDate: today } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, resumed: true };

  const flagged = await collectFlaggedItems(selected);

  // Carry-over: if this auditor already gave a verdict on the same task/note
  // in an earlier report and it is still flagged, keep the verdict and mark
  // it carried over instead of asking again.
  const taskIds = flagged.filter((f) => f.taskId).map((f) => f.taskId!);
  const noteIds = flagged.filter((f) => f.noteId).map((f) => f.noteId!);
  const priorItems = await prisma.taskAuditItem.findMany({
    where: {
      audit: { createdById: user.id, auditDate: { lt: today } },
      verdict: { in: ["blamed", "excused"] },
      OR: [
        ...(taskIds.length > 0 ? [{ taskId: { in: taskIds } }] : []),
        ...(noteIds.length > 0 ? [{ noteId: { in: noteIds } }] : []),
      ],
    },
    select: {
      taskId: true,
      noteId: true,
      verdict: true,
      blamedUserId: true,
      reasonNote: true,
      audit: { select: { auditDate: true } },
    },
    orderBy: { audit: { auditDate: "desc" } },
  });
  const priorByKey = new Map<string, (typeof priorItems)[0]>();
  for (const p of priorItems) {
    const key = p.taskId ? `t:${p.taskId}` : `n:${p.noteId}`;
    if (!priorByKey.has(key)) priorByKey.set(key, p);
  }

  const teamNames = access.teams
    .filter((t) => selected.includes(t.id))
    .map((t) => t.name);

  const audit = await prisma.taskAudit.create({
    data: {
      auditDate: today,
      createdById: user.id,
      teamIds: selected,
      teamNames,
      items: {
        create: flagged.map((f) => {
          const prior = priorByKey.get(f.taskId ? `t:${f.taskId}` : `n:${f.noteId}`);
          return {
            ...f,
            ...(prior
              ? {
                  carriedOver: true,
                  verdict: prior.verdict,
                  blamedUserId: prior.blamedUserId,
                  reasonNote: prior.reasonNote,
                  decidedAt: new Date(),
                }
              : {}),
          };
        }),
      },
    },
    select: { id: true },
  });

  revalidatePath("/dashboard/audit");
  return { id: audit.id, resumed: false };
}

// ─── Report detail ──────────────────────────────────────

export type AuditItemDTO = {
  id: string;
  taskId: string | null;
  noteId: string | null;
  flagType: string;
  severity: number;
  title: string;
  taskNumber: number | null;
  projectId: string;
  projectName: string;
  teamName: string | null;
  stageLabel: string | null;
  stageHours: number | null;
  declineCount: number | null;
  dueInDays: number | null;
  assigneeName: string | null;
  carriedOver: boolean;
  verdict: string;
  blamedUser: { id: string; name: string | null; imageUrl: string | null } | null;
  reasonNote: string | null;
};

export type AuditReportDTO = {
  id: string;
  auditDate: string;
  teamNames: string[];
  status: string;
  submittedAt: string | null;
  createdBy: { id: string; name: string | null };
  isOwner: boolean;
  items: AuditItemDTO[];
};

export async function getAuditReport(auditId: string): Promise<AuditReportDTO | null> {
  const { user, access } = await requireAuditor();

  const audit = await prisma.taskAudit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      auditDate: true,
      teamNames: true,
      status: true,
      submittedAt: true,
      createdBy: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          taskId: true,
          noteId: true,
          flagType: true,
          severity: true,
          title: true,
          taskNumber: true,
          projectId: true,
          projectName: true,
          teamName: true,
          stageLabel: true,
          stageHours: true,
          declineCount: true,
          dueInDays: true,
          assigneeName: true,
          carriedOver: true,
          verdict: true,
          blamedUser: { select: { id: true, name: true, imageUrl: true } },
          reasonNote: true,
        },
      },
    },
  });
  if (!audit) return null;
  if (!access.isAdmin && audit.createdBy.id !== user.id) return null;

  return {
    id: audit.id,
    auditDate: audit.auditDate.toISOString(),
    teamNames: audit.teamNames,
    status: audit.status,
    submittedAt: audit.submittedAt?.toISOString() ?? null,
    createdBy: audit.createdBy,
    isOwner: audit.createdBy.id === user.id,
    items: audit.items.sort(compareAuditItems),
  };
}

// ─── Blame candidates ───────────────────────────────────

export type BlameCandidatesDTO = {
  timeline: OwnershipEvent[];
  candidates: { userId: string; userName: string | null; imageUrl?: string | null }[];
};

/**
 * People involved in a flagged item's history — the pool the auditor picks
 * the responsible person from. Tasks: creator + everyone who assigned,
 * moved, or declined. Deadline notes: author + mentioned users.
 */
export async function getBlameCandidates(item: {
  taskId?: string | null;
  noteId?: string | null;
}): Promise<BlameCandidatesDTO> {
  await requireAuditor();

  if (item.taskId) {
    const activities = await prisma.taskActivity.findMany({
      where: { taskId: item.taskId },
      select: {
        action: true,
        field: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { id: true, name: true, imageUrl: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    });
    const timeline = buildOwnershipTimeline(activities);
    return { timeline, candidates: blameCandidates(timeline) };
  }

  if (item.noteId) {
    const note = await prisma.meetingNote.findUnique({
      where: { id: item.noteId },
      select: {
        content: true,
        createdAt: true,
        author: { select: { id: true, name: true, imageUrl: true } },
      },
    });
    if (!note) return { timeline: [], candidates: [] };

    const timeline: OwnershipEvent[] = [
      {
        userId: note.author.id,
        userName: note.author.name,
        imageUrl: note.author.imageUrl,
        label: "Created the deadline",
        at: note.createdAt.toISOString(),
      },
    ];

    // Mentioned users are the people the deadline was assigned to.
    const mentionIds = [...note.content.matchAll(/data-user-id="([^"]+)"/g)].map(
      (m) => m[1],
    );
    if (mentionIds.length > 0) {
      const mentioned = await prisma.user.findMany({
        where: { id: { in: mentionIds } },
        select: { id: true, name: true, imageUrl: true },
      });
      for (const u of mentioned) {
        timeline.push({
          userId: u.id,
          userName: u.name,
          imageUrl: u.imageUrl,
          label: "Mentioned in the deadline",
          at: note.createdAt.toISOString(),
        });
      }
    }

    return { timeline, candidates: blameCandidates(timeline) };
  }

  return { timeline: [], candidates: [] };
}

// ─── Verdicts / submit ──────────────────────────────────

export async function setAuditItemVerdict(
  itemId: string,
  input: {
    verdict: "blamed" | "excused" | "skipped" | "pending";
    blamedUserId?: string | null;
    reasonNote?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireAuditor();

  const item = await prisma.taskAuditItem.findUnique({
    where: { id: itemId },
    select: { id: true, audit: { select: { id: true, createdById: true, status: true } } },
  });
  if (!item || item.audit.createdById !== user.id)
    return { ok: false, error: "Not found" };
  if (item.audit.status !== "draft")
    return { ok: false, error: "Report already submitted" };
  if (input.verdict === "blamed" && !input.blamedUserId)
    return { ok: false, error: "Pick the responsible person" };

  await prisma.taskAuditItem.update({
    where: { id: itemId },
    data: {
      verdict: input.verdict,
      blamedUserId: input.verdict === "blamed" ? input.blamedUserId : null,
      reasonNote: input.reasonNote?.trim() || null,
      decidedAt: input.verdict === "pending" ? null : new Date(),
    },
  });

  return { ok: true };
}

export async function submitAuditReport(
  auditId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireAuditor();

  const audit = await prisma.taskAudit.findUnique({
    where: { id: auditId },
    select: { id: true, createdById: true, status: true },
  });
  if (!audit || audit.createdById !== user.id) return { ok: false, error: "Not found" };
  if (audit.status !== "draft") return { ok: false, error: "Already submitted" };

  await prisma.taskAudit.update({
    where: { id: auditId },
    data: { status: "submitted", submittedAt: new Date() },
  });

  revalidatePath("/dashboard/audit");
  return { ok: true };
}

// ─── Admin: permission management ───────────────────────

export type AuditGrantRow = {
  user: { id: string; name: string | null; email: string; imageUrl: string | null };
  teamIds: string[];
};

export async function getAuditPermissionAdminData(): Promise<{
  teams: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string; imageUrl: string | null }[];
  grants: AuditGrantRow[];
}> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const [teams, members, permissions] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { blocked: false, systemRole: { not: "CLIENT" } },
      select: { id: true, name: true, email: true, imageUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.auditPermission.findMany({
      select: {
        teamId: true,
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
      },
    }),
  ]);

  const grantsByUser = new Map<string, AuditGrantRow>();
  for (const p of permissions) {
    const entry = grantsByUser.get(p.user.id);
    if (entry) entry.teamIds.push(p.teamId);
    else grantsByUser.set(p.user.id, { user: p.user, teamIds: [p.teamId] });
  }

  return { teams, members, grants: [...grantsByUser.values()] };
}

/** Replaces a user's audit grants with the given team set. Empty = revoke. */
export async function setUserAuditTeams(
  userId: string,
  teamIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireUser();
  if (admin.systemRole !== "ADMIN") return { ok: false, error: "Admin only" };

  await prisma.$transaction([
    prisma.auditPermission.deleteMany({ where: { userId } }),
    ...(teamIds.length > 0
      ? [
          prisma.auditPermission.createMany({
            data: teamIds.map((teamId) => ({
              userId,
              teamId,
              grantedById: admin.id,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  revalidatePath("/dashboard/admin");
  return { ok: true };
}
