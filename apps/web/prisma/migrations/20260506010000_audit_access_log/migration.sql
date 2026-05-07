-- Feature: Audit access log
-- Records every access to a public audit link (view + export).
-- Rate-limited at the API layer to 1 entry / IP / minute / link.

CREATE TABLE "AuditAccessLog" (
    "id"          TEXT NOT NULL,
    "auditLinkId" TEXT NOT NULL,
    "accessedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip"          TEXT,
    "userAgent"   TEXT,
    "action"      TEXT NOT NULL,

    CONSTRAINT "AuditAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditAccessLog_auditLinkId_idx" ON "AuditAccessLog"("auditLinkId");
CREATE INDEX "AuditAccessLog_auditLinkId_accessedAt_idx" ON "AuditAccessLog"("auditLinkId", "accessedAt");

ALTER TABLE "AuditAccessLog" ADD CONSTRAINT "AuditAccessLog_auditLinkId_fkey"
  FOREIGN KEY ("auditLinkId") REFERENCES "AuditLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
