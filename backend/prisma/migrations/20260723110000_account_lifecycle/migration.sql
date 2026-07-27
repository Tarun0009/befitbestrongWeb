-- Account lifecycle state allows recovery before final deletion while making
-- pending accounts easy to exclude from all user-facing queries.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DELETION_PENDING');

ALTER TYPE "EmailTemplate" ADD VALUE 'ACCOUNT_SECURITY';
ALTER TYPE "EmailTemplate" ADD VALUE 'EMAIL_CHANGE_CONFIRMATION';

ALTER TABLE "User"
ADD COLUMN "pendingEmail" TEXT,
ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "sessionTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailChangeRequestedAt" TIMESTAMP(3),
ADD COLUMN "emailChangeExpiresAt" TIMESTAMP(3),
ADD COLUMN "emailChangedAt" TIMESTAMP(3),
ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_pendingEmail_key" ON "User"("pendingEmail");
CREATE INDEX "User_accountStatus_deletionScheduledFor_idx"
ON "User"("accountStatus", "deletionScheduledFor");

CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSession_userId_tokenHash_key" ON "UserSession"("userId", "tokenHash");
CREATE INDEX "UserSession_userId_revokedAt_lastSeenAt_idx" ON "UserSession"("userId", "revokedAt", "lastSeenAt" DESC);
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
