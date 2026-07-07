import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasProjectAccess } from "@/lib/project-access";
import { GLOBAL_PRESENCE_ID } from "@/lib/channels";
import {
  connectionToken,
  subscriptionToken,
  isCentrifugoConfigured,
} from "@/lib/centrifugo";

export const runtime = "nodejs";

// Mints Centrifugo JWTs for the signed-in user (identity = User.id).
//   POST {}                       -> connection token
//   POST { channel: "task:123" }  -> subscription token (after access check)
export async function POST(request: NextRequest) {
  if (!isCentrifugoConfigured()) {
    return NextResponse.json({ error: "Realtime disabled" }, { status: 503 });
  }

  let memberId: string;
  try {
    const user = await requireUser();
    memberId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { channel?: string };
  const channel = body.channel;

  if (!channel) {
    return NextResponse.json({ token: connectionToken(memberId) });
  }

  const allowed = await canSubscribe(channel, memberId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ token: subscriptionToken(memberId, channel) });
}

async function canSubscribe(channel: string, memberId: string): Promise<boolean> {
  const [namespace, rest] = splitChannel(channel);

  switch (namespace) {
    case "user": {
      // user:<memberId>#<memberId> — only the owner may read their stream.
      const id = rest.split("#")[0];
      return id === memberId && channel.endsWith(`#${memberId}`);
    }
    case "presence": {
      return rest === GLOBAL_PRESENCE_ID;
    }
    case "project": {
      return hasProjectAccess(rest);
    }
    case "task": {
      const task = await prisma.task.findFirst({
        where: { id: rest },
        select: { projectId: true },
      });
      if (!task) return false;
      return hasProjectAccess(task.projectId);
    }
    case "conv": {
      const participant = await prisma.conversationParticipant.findFirst({
        where: { conversationId: rest, memberId },
        select: { id: true },
      });
      return Boolean(participant);
    }
    default:
      return false;
  }
}

function splitChannel(channel: string): [string, string] {
  const idx = channel.indexOf(":");
  if (idx === -1) return [channel, ""];
  return [channel.slice(0, idx), channel.slice(idx + 1)];
}
