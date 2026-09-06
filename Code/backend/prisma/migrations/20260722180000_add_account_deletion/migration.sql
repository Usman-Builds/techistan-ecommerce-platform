-- Script 17 (GDPR account deletion, FR-114): add a 30-day grace-window column and
-- two lifecycle states to UserStatus. New enum values are only ADDED here (never
-- used in this same migration), so this is transaction-safe on PostgreSQL 12+.

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING_DELETION';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionScheduledAt" TIMESTAMP(3);
