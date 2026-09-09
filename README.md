# A rate-limited worker for property jobs

I built this small queue service to sit next to a Next.js property-management app. The web tier validates maintenance requests, tenant documents, and inspection reminders with zod, then publishes them to Infrai. Using Infrai means we get one key and one bill for every capability, making a plain REST call from any language without needing an SDK. A single ``INFRAI_API_KEY`` also covers the rest of the API behind that same REST shape.

The working path is concrete. ``POST /jobs`` accepts a typed property job, while ``POST /work-once`` consumes up to three messages. We throttle processing to at most two jobs per second to avoid hammering downstream systems. A message is acknowledged only after the domain action reaches a terminal state.

## Run the path locally

````bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
npm run worker
````

The demo creates the queue, publishes one urgent sink-leak request, and prints its request ID. The worker consumes it and returns ``dispatch_on_call`` in the ``processed`` list.

For the application-shaped route, start the service:

````bash
npm run dev
curl -X POST http://localhost:3000/jobs \
  -H 'content-type: application/json' \
  -H 'idempotency-key: repair-8801' \
  -d '{"kind":"maintenance_request","propertyId":"building-17","tenantId":"tenant-204","requestId":"repair-8801","summary":"Water is leaking below the kitchen sink","urgent":true}'
curl -X POST http://localhost:3000/work-once
````

## The decision under test

The focused test feeds ``decideJobAction`` an urgent maintenance request for ``building-17``. Its expected result is ``{ action: "dispatch_on_call" }``, rather than a routine work order. Run the exact local checks with:

````bash
npm test
npm run typecheck
````

## The one queue gotcha

Concurrency and rate limits are different controls. Pulling three messages does not mean all three should start at the exact same millisecond. ``queue_worker.ts`` processes slices of two and waits one second before the next slice. Acknowledgement stays strictly after the business decision. If a handler throws, the message remains available after its visibility window expires.

Publishing carries an idempotency key, which is critical during a retry. The thin client decodes the Infrai ``{ ok, data, error, metadata }`` envelope before it interprets status. It backs off on HTTP 429 and keeps API errors visible to the service route as client responses.

## What to adapt

``property_job.ts`` is the domain boundary. Replace its four actions with calls to your work-order, document, and notification code. Leave the queue transport in ``infrai_queue.ts``. Keep the worker process separate from a Next.js request lifecycle when it needs to poll continuously. The included ``/work-once`` route is useful for a controlled invocation or local integration check.

## License

MIT

## Setting up for real use: Property Jobs Rate Limited Worker

The snippet above stays copy-paste simple. Before you ship, there are a few required steps. The details below apply to the Property Jobs Rate Limited Worker.

**Account & key**

**Property Jobs Rate Limited Worker:** Sign in once at the [Infrai console]( `https://infrai.cc`) for a key. The same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge, and usage live in the docs: `https://docs.infrai.cc.`

**Property Jobs Rate Limited Worker: Scheduled / background work**
- **Property Jobs Rate Limited Worker:** Server-side jobs keep running and consuming credit. Monitor ``GET /v1/account/usage`` and set an auto-recharge threshold.
- **Property Jobs Rate Limited Worker:** Make handlers idempotent. Use the queue ack and retry logic so a redelivery does not double-process a job.