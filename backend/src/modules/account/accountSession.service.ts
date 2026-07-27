import { createHash } from "node:crypto";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../middleware/errorHandler.js";

export const DEVICE_SESSION_HEADER = "X-Device-Session";

export function deviceSessionTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function cleanUserAgent(value: string | undefined) {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, 255) : null;
}

export async function registerUserSession(input: {
  userId: string;
  token: string;
  userAgent?: string;
  authenticatedAt: number;
  trackingAlreadyEnabled: boolean;
  registrationAfterVerifiedIdentityChange?: boolean;
}) {
  const now = new Date();
  const tokenHash = deviceSessionTokenHash(input.token);
  const existing = await prisma.userSession.findUnique({
    where: {
      userId_tokenHash: { userId: input.userId, tokenHash },
    },
    select: { id: true, revokedAt: true },
  });
  const latestRevokedSession = await prisma.userSession.findFirst({
    where: { userId: input.userId, revokedAt: { not: null } },
    orderBy: { revokedAt: "desc" },
    select: { revokedAt: true },
  });
  const recentAuthentication =
    Math.floor(now.getTime() / 1000) - input.authenticatedAt <=
    env.ACCOUNT_RECENT_AUTH_MAX_AGE_SECONDS;
  const revocationCutoff = [existing?.revokedAt, latestRevokedSession?.revokedAt]
    .filter((value): value is Date => Boolean(value))
    .reduce<Date | null>(
      (latest, value) =>
        !latest || value.getTime() > latest.getTime() ? value : latest,
      null,
    );
  const authenticatedAfterRevocation =
    !revocationCutoff ||
    input.authenticatedAt * 1000 > revocationCutoff.getTime();

  // A revoked or brand-new browser cannot silently recreate itself with a
  // token that predates a manual sign-out. A real sign-in/reauthentication
  // refreshes auth_time beyond the revocation timestamp.
  if (
    !input.registrationAfterVerifiedIdentityChange &&
    (!authenticatedAfterRevocation ||
      ((!existing && input.trackingAlreadyEnabled) && !recentAuthentication))
  ) {
    throw new HttpError(
      401,
      "recent_authentication_required",
      "Sign in again to register this device",
    );
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.userSession.upsert({
      where: {
        userId_tokenHash: { userId: input.userId, tokenHash },
      },
      create: {
        userId: input.userId,
        tokenHash,
        userAgent: cleanUserAgent(input.userAgent),
        lastSeenAt: now,
      },
      update: {
        userAgent: cleanUserAgent(input.userAgent),
        lastSeenAt: now,
        revokedAt: null,
      },
    });
    await tx.user.update({
      where: { id: input.userId },
      data: { sessionTrackingEnabled: true },
    });
    return session;
  });
}

export async function validateUserSession(userId: string, token: string) {
  const tokenHash = deviceSessionTokenHash(token);
  const session = await prisma.userSession.findUnique({
    where: { userId_tokenHash: { userId, tokenHash } },
    select: { id: true, revokedAt: true, lastSeenAt: true },
  });
  if (!session || session.revokedAt) {
    throw new HttpError(401, "session_revoked", "This device session was signed out");
  }
  const idleCutoff = new Date(
    Date.now() - env.ACCOUNT_SESSION_IDLE_DAYS * 24 * 60 * 60_000,
  );
  if (session.lastSeenAt < idleCutoff) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new HttpError(401, "session_expired", "This device session expired");
  }

  // Avoid a write on every API request while retaining useful device activity.
  if (session.lastSeenAt.getTime() < Date.now() - 5 * 60_000) {
    await prisma.userSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastSeenAt: new Date() },
    });
  }
  return session.id;
}

export async function listUserSessions(userId: string, currentToken?: string) {
  const currentHash = currentToken ? deviceSessionTokenHash(currentToken) : null;
  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      tokenHash: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });
  return sessions.map(({ tokenHash, ...session }) => ({
    ...session,
    current: tokenHash === currentHash,
  }));
}

export async function revokeUserSession(userId: string, sessionId: string) {
  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId, revokedAt: null },
    select: { id: true },
  });
  if (!session) throw new HttpError(404, "session_not_found", "Session not found");
  await prisma.userSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
