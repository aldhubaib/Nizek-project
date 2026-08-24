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

// Short-TTL in-memory cache of channel-access decisions so a client subscribing
// to many channels in quick succession doesn't re-run the DB access check for
// each one. Keyed by `${memberId}:${channel}`. Realtime auth tolerates a small
// staleness window; anything longer than the TTL re-verifies.
const ACCESS_TTL_MS = 120_000;
const accessCache = new Map<string, { allowed: boolean; expires: number }>();

function getCachedAccess(key: string): boolean | undefined {
  const hit = accessCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    accessCache.delete(key);
    return undefined;
  }
  return hit.allowed;
}

function setCachedAccess(key: string, allowed: boolean): void {
  accessCache.set(key, { allowed, expires: Date.now() + ACCESS_TTL_MS });
  // Opportunistic cleanup so the map can't grow unbounded.
  if (accessCache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of accessCache) if (v.expires < now) accessCache.delete(k);
  }
}

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

  const body = (await request.json().catch(() => ({}))) as {
    channel?: string;
    deviceId?: string;
  };
  const channel = body.channel;

  if (!channel) {
    // Embed deviceId in the connection info so presence can tell which of the
    // user's devices is connected (foreground/active) for presence-aware push.
    const info =
      typeof body.deviceId === "string" && body.deviceId
        ? { deviceId: body.deviceId }
        : undefined;
    return NextResponse.json({ token: connectionToken(memberId, info) });
  }

  const cacheKey = `${memberId}:${channel}`;
  let allowed = getCachedAccess(cacheKey);
  if (allowed === undefined) {
    allowed = await canSubscribe(channel, memberId);
    setCachedAccess(cacheKey, allowed);
  }
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
