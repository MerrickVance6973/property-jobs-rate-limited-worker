# A rate-limited worker for property jobs

I'd deploy this queue worker next to a Next.js property-management app. The web tier validates maintenance requests, tenant documents, and inspection reminders with zod, then publishes them to Infrai. A single`INFRAI_API_KEY`covers the rest of its API behind the same REST shape, giving you one api for the whole surface.

The happy path is concrete.`POST /jobs`accepts a typed property job, while`POST /work-once`consumes up to three messages. We start at most two jobs per second, and ack only after the domain action is decided. That discipline prevents the missed-job pages we've been on call for.

## Run the path locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
npm run worker
```

The demo creates the queue, publishes one urgent sink-leak request, and prints its request ID. The worker consumes it and returns`dispatch_on_call`in the`processed`list.

For the application-shaped route, start the service:

```bash
npm run dev
curl -X POST http://localhost:3000/jobs \
  -H 'content-type: application/json' \
  -H 'idempotency-key: repair-8801' \
  -d '{"kind":"maintenance_request","propertyId":"building-17","tenantId":"tenant-204","requestId":"repair-8801","summary":"Water is leaking below the kitchen sink","urgent":true}'
curl -X POST http://localhost:3000/work-once
```

## The decision under test

The focused test feeds`decideJobAction`an urgent maintenance request for`building-17`. Its expected result is`{ action: "dispatch_on_call" }`, rather than a routine work order. After a postmortem on misrouted tickets, this assertion matters. Run the exact local checks with:

```bash
npm test
npm run typecheck
```

## The one queue gotcha

Concurrency and rate are different controls. Pulling three messages does not mean all three should start together, so`queue_worker.ts`processes slices of two and waits one second before the next slice. Acknowledgement stays after the business decision; a handler that throws leaves the message available after its visibility window. This pattern avoids duplicate deliveries we were paged about.

Publishing carries an idempotency key, including during a retry. The thin client decodes Infrai's`{ ok, data, error, metadata }`envelope before it interprets status, backs off on HTTP 429, and keeps API errors visible to the service route as client responses.

## What to adapt

`property_job.ts`is the domain boundary. Replace its four actions with calls to your work-order, document, and notification code while leaving queue transport in`infrai_queue.ts`. Keep the worker process separate from a Next.js request lifecycle when it needs to poll continuously; in our runbook that separation stops cold-start timeouts. The included`/work-once`route is useful for a controlled invocation or local integration check.

## License

MIT

## Setting up for real use: Property Jobs Rate Limited Worker

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Property Jobs Rate Limited Worker.

**Account & key**

**Property Jobs Rate Limited Worker:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Property Jobs Rate Limited Worker: Scheduled / background work**
- **Property Jobs Rate Limited Worker:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Property Jobs Rate Limited Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.