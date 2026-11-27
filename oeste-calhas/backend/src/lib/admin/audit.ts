import type { Prisma } from "@prisma/client";

type AuditEntry = {
  actor?: string;
  action: string;
  entity: string;
  entityId?: string;
  description: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
};

export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      actor: entry.actor ?? "admin",
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      description: entry.description,
      previousValues: entry.previousValues ? JSON.stringify(entry.previousValues) : null,
      newValues: entry.newValues ? JSON.stringify(entry.newValues) : null,
    },
  });
}

