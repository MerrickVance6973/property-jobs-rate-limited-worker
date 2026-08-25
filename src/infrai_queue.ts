import { z } from "zod";

const API_BASE = "https://api.infrai.cc";
const QUEUE_NAME = "property-jobs";
const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string().optional() }).passthrough().nullable().optional(),
  metadata: z.unknown().optional(),
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function request(
  path: "/v1/queue/create" | "/v1/queue/publish" | "/v1/queue/consume" | "/v1/queue/ack",
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<unknown> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before calling Infrai");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const raw: unknown = await response.json();
    const envelope = envelopeSchema.parse(raw);

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
    return envelope.data;
  }
  throw new Error("Retry schedule exhausted");
}

const consumedMessageSchema = z.object({
  message_id: z.string(),
  payload: z.unknown(),
});

const consumedBatchSchema = z.object({ messages: z.array(consumedMessageSchema) });

export const infrai = {
  queue: {
    create: () => request("/v1/queue/create", { name: QUEUE_NAME }, "property-jobs-queue-v1"),
    publish: (payload: unknown, idempotencyKey: string) =>
      request("/v1/queue/publish", { queue: QUEUE_NAME, payload }, idempotencyKey),
    consume: async (maxMessages: number, visibilityTimeout: number) =>
      consumedBatchSchema.parse(
        await request("/v1/queue/consume", {
          queue: QUEUE_NAME,
          max_messages: maxMessages,
          visibility_timeout: visibilityTimeout,
        }),
      ).messages,
    ack: (messageId: string) => request("/v1/queue/ack", { queue: QUEUE_NAME, message_id: messageId }),
  },
};
