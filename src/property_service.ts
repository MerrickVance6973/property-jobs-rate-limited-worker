import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai_queue.js";
import { propertyJobSchema } from "./property_job.js";
import { workOnce } from "./queue_worker.js";

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: NodeJS.ReadableStream): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/jobs") {
      const job = propertyJobSchema.parse(await readBody(request));
      const publishId = request.headers["idempotency-key"] ?? randomUUID();
      if (Array.isArray(publishId)) return json(response, 400, { error: "Use one idempotency key" });
      await infrai.queue.publish(job, publishId);
      return json(response, 202, { accepted: true, idempotencyKey: publishId });
    }

    if (request.method === "POST" && request.url === "/work-once") {
      return json(response, 200, { processed: await workOnce() });
    }
    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) return json(response, 400, { error: "Invalid job", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code });
    }
    return json(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Property job service listening on http://localhost:${port}`));
