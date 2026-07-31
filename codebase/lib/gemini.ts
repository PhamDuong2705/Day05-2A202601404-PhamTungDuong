const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";
export const DEFAULT_RESOLVER_MODEL =
  process.env.GEMINI_RESOLVER_MODEL ?? "gemini-3.6-flash";

type EmbeddingResponse = {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
};

type InteractionResponse = {
  output_text?: string;
};

function requireOk(response: Response, action: string) {
  if (!response.ok) {
    throw new Error(`${action} failed with HTTP ${response.status}`);
  }
}

export async function embedOne({
  apiKey,
  text,
  taskType,
  title,
  model = DEFAULT_EMBEDDING_MODEL,
}: {
  apiKey: string;
  text: string;
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";
  title?: string;
  model?: string;
}) {
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        embedContentConfig: {
          taskType,
          title: taskType === "RETRIEVAL_DOCUMENT" ? title : undefined,
          outputDimensionality: 768,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  requireOk(response, "Embedding query");
  const payload = (await response.json()) as EmbeddingResponse;
  const values = payload.embedding?.values;
  if (!values?.length) throw new Error("Embedding response has no vector");
  return values;
}

export async function embedMany({
  apiKey,
  documents,
  model = DEFAULT_EMBEDDING_MODEL,
}: {
  apiKey: string;
  documents: Array<{ text: string; title: string }>;
  model?: string;
}) {
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:batchEmbedContents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        requests: documents.map((document) => ({
          model: `models/${model}`,
          content: { parts: [{ text: document.text }] },
          embedContentConfig: {
            taskType: "RETRIEVAL_DOCUMENT",
            title: document.title,
            outputDimensionality: 768,
          },
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  requireOk(response, "Embedding documents");
  const payload = (await response.json()) as EmbeddingResponse;
  const vectors = payload.embeddings?.map((item) => item.values ?? []);
  if (
    !vectors ||
    vectors.length !== documents.length ||
    vectors.some((vector) => vector.length === 0)
  ) {
    throw new Error("Batch embedding response is incomplete");
  }
  return vectors;
}

export async function generateStructuredJson({
  apiKey,
  prompt,
  schema,
  model = DEFAULT_RESOLVER_MODEL,
}: {
  apiKey: string;
  prompt: string;
  schema: Record<string, unknown>;
  model?: string;
}) {
  const response = await fetch(`${GEMINI_API_BASE}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  requireOk(response, "Resolver generation");
  const payload = (await response.json()) as InteractionResponse;
  if (!payload.output_text) throw new Error("Resolver response has no output_text");
  return JSON.parse(payload.output_text) as unknown;
}
