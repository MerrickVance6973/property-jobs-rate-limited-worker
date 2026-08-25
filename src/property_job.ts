import { z } from "zod";

const baseJob = z.object({
  propertyId: z.string().min(1),
  tenantId: z.string().min(1),
});

export const propertyJobSchema = z.discriminatedUnion("kind", [
  baseJob.extend({
    kind: z.literal("maintenance_request"),
    requestId: z.string().min(1),
    summary: z.string().min(1).max(500),
    urgent: z.boolean(),
  }),
  baseJob.extend({
    kind: z.literal("tenant_document"),
    documentId: z.string().min(1),
    documentType: z.enum(["lease", "insurance", "identity"]),
  }),
  baseJob.extend({
    kind: z.literal("inspection_reminder"),
    inspectionId: z.string().min(1),
    scheduledFor: z.string().datetime(),
  }),
]);

export type PropertyJob = z.infer<typeof propertyJobSchema>;

export type JobResult = {
  jobKind: PropertyJob["kind"];
  propertyId: string;
  action: "dispatch_on_call" | "open_work_order" | "index_document" | "notify_tenant";
};

export function decideJobAction(job: PropertyJob, now: Date): JobResult {
  if (job.kind === "maintenance_request") {
    return {
      jobKind: job.kind,
      propertyId: job.propertyId,
      action: job.urgent ? "dispatch_on_call" : "open_work_order",
    };
  }

  if (job.kind === "tenant_document") {
    return { jobKind: job.kind, propertyId: job.propertyId, action: "index_document" };
  }

  const hoursUntilInspection =
    (new Date(job.scheduledFor).getTime() - now.getTime()) / (60 * 60 * 1000);
  if (hoursUntilInspection < 0 || hoursUntilInspection > 48) {
    throw new Error("Inspection reminders are processed from 0 to 48 hours before the visit");
  }
  return { jobKind: job.kind, propertyId: job.propertyId, action: "notify_tenant" };
}
