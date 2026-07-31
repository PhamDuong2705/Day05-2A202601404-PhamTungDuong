import assert from "node:assert/strict";
import test from "node:test";

import { embedMany } from "../lib/gemini.ts";

test("embedMany splits a 250-document corpus into ordered batches", async () => {
  const originalFetch = globalThis.fetch;
  const batchSizes = [];

  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    batchSizes.push(payload.requests.length);

    return Response.json({
      embeddings: payload.requests.map((request) => ({
        values: [Number(request.title.replace("document-", ""))],
      })),
    });
  };

  try {
    const documents = Array.from({ length: 250 }, (_, index) => ({
      title: `document-${index}`,
      text: `Synthetic content ${index}`,
    }));
    const vectors = await embedMany({
      apiKey: "test-key",
      documents,
      model: "test-embedding-model",
    });

    assert.deepEqual(batchSizes, [100, 100, 50]);
    assert.equal(vectors.length, 250);
    assert.deepEqual(
      vectors.map((vector) => vector[0]),
      Array.from({ length: 250 }, (_, index) => index),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
