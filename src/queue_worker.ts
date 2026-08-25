import { infrai } from "./infrai_queue.js";
import { decideJobAction, propertyJobSchema, type JobResult } from "./property_job.js";

const concurrency = 3;
const startsPerSecond = 2;

async function processMessage(payload: unknown): Promise<JobResult> {
  const job = propertyJobSchema.parse(payload);
  return decideJobAction(job, new Date());
}

export async function workOnce(): Promise<JobResult[]> {
  const messages = await infrai.queue.consume(concurrency, 60);
  const results: JobResult[] = [];

  for (let offset = 0; offset < messages.length; offset += startsPerSecond) {
    const slice = messages.slice(offset, offset + startsPerSecond);
    const settled = await Promise.all(
      slice.map(async (message) => {
        const result = await processMessage(message.payload);
        await infrai.queue.ack(message.message_id);
        return result;
      }),
    );
    results.push(...settled);
    if (offset + startsPerSecond < messages.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  workOnce()
    .then((results) => console.log(JSON.stringify({ processed: results }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
