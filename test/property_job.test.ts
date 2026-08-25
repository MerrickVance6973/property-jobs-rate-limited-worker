import { describe, expect, it } from "vitest";
import { decideJobAction, propertyJobSchema } from "../src/property_job.js";

describe("property job decision", () => {
  it("sends an urgent maintenance request to the on-call team", () => {
    const job = propertyJobSchema.parse({
      kind: "maintenance_request",
      propertyId: "building-17",
      tenantId: "tenant-204",
      requestId: "repair-8801",
      summary: "Water is leaking below the kitchen sink",
      urgent: true,
    });

    expect(decideJobAction(job, new Date("2026-08-15T10:00:00Z"))).toEqual({
      jobKind: "maintenance_request",
      propertyId: "building-17",
      action: "dispatch_on_call",
    });
  });
});
