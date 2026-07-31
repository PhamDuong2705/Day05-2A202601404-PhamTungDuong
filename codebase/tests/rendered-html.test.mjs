import assert from "node:assert/strict";
import test from "node:test";

let workerPromise;

async function getWorker() {
  workerPromise ??= (async () => {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    const workerModule = await import(workerUrl.href);
    return workerModule.default;
  })();
  return workerPromise;
}

async function workerFetch(request) {
  const worker = await getWorker();
  return worker.fetch(
    request,
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Discord Question Resolver prototype", async () => {
  const response = await workerFetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Discord Question Resolver<\/title>/i);
  assert.match(html, /hỏi-bài-day-2/);
  assert.match(html, /Question Resolver/);
  assert.match(html, /Chạy resolver/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

const decisionCases = [
  {
    name: "resolved",
    question: "RAG khác fine-tuning như thế nào?",
    expectedStatus: "resolved",
  },
  {
    name: "clarify",
    question: "Cái này làm sao vậy?",
    expectedStatus: "clarify",
    expectedRetrieved: 0,
  },
  {
    name: "escalated",
    question: "Em bị shape mismatch trong bài attention nhưng chưa có code.",
    expectedStatus: "escalated",
  },
  {
    name: "out of scope",
    question: "Mai thời tiết ở Hà Nội có mưa không?",
    expectedStatus: "out_of_scope",
  },
];

for (const decisionCase of decisionCases) {
  test(`demo resolver returns ${decisionCase.name}`, async () => {
    const response = await workerFetch(
      new Request("http://localhost/api/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: decisionCase.question }),
      }),
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, decisionCase.expectedStatus);
    assert.equal(payload.trace.mode, "demo");
    assert.equal(
      payload.trace.retrieved.length,
      decisionCase.expectedRetrieved ?? 5,
    );

    if (payload.status === "resolved") {
      assert.ok(payload.sources.length >= 1);
      assert.ok(payload.trace.validatedSourceIds.length >= 1);
    } else {
      assert.deepEqual(payload.sources, []);
    }
  });
}

test("resolver rejects an oversized question", async () => {
  const response = await workerFetch(
    new Request("http://localhost/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "x".repeat(1_001) }),
    }),
  );
  assert.equal(response.status, 400);
});
