-- CreateTable
CREATE TABLE "TenantHelpConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelsJson" TEXT NOT NULL DEFAULT '[]',
    "hoursJson" TEXT,
    "contactLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HandoffRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "summaryJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantHelpConfig_tenantId_key" ON "TenantHelpConfig"("tenantId");

-- CreateIndex
CREATE INDEX "HandoffRequest_tenantId_status_idx" ON "HandoffRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "HandoffRequest_sessionId_idx" ON "HandoffRequest"("sessionId");
