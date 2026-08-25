import { infrai } from "./infrai_queue.js";

const sampleJob = {
  kind: "maintenance_request",
  propertyId: "building-17",
  tenantId: "tenant-204",
  requestId: "repair-8801",
  summary: "Water is leaking below the kitchen sink",
  urgent: true,
} as const;

await infrai.queue.create();
await infrai.queue.publish(sampleJob, sampleJob.requestId);
console.log(JSON.stringify({ accepted: sampleJob.requestId, nextAction: "run npm run worker" }, null, 2));
