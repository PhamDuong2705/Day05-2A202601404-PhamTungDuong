const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";
export const DEFAULT_RESOLVER_MODEL =
  process.env.GEMINI_RESOLVER_MODEL ?? "gemini-3.1-flash-lite";

type EmbeddingResponse = {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
};

type InteractionResponse = {
  output_text?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function retryDelayMs(response: Response, body: string, attempt: number) {
  const retryAfter = Number.parseFloat(response.headers.get("retry-after") ?? "");
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1_000;
  }
  const messageDelay = body.match(/retry in ([\d.]+)s/i);
  if (messageDelay) return Number.parseFloat(messageDelay[1]) * 1_000;
  return 1_000 * 2 ** attempt;
}

async function fetchGemini(
  url: string,
  init: Omit<RequestInit, "signal">,
  action: string,
  timeoutMs: number,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return response;

    const body = await response.text();
    const retryable =
      response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) {
      throw new Error(`${action} failed with HTTP ${response.status}`);
    }

    const delay = Math.min(
      15_000,
      Math.max(500, retryDelayMs(response, body, attempt)) +
        Math.round(Math.random() * 500),
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`${action} failed after retries`);
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
  const response = await fetchGemini(
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
        taskType,
        title: taskType === "RETRIEVAL_DOCUMENT" ? title : undefined,
        outputDimensionality: 768,
      }),
    },
    "Embedding query",
    20_000,
  );
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
  const response = await fetchGemini(
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
          taskType: "RETRIEVAL_DOCUMENT",
          title: document.title,
          outputDimensionality: 768,
        })),
      }),
    },
    "Embedding documents",
    30_000,
  );
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
  const response = await fetchGemini(
    `${GEMINI_API_BASE}/interactions`,
    {
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
    },
    "Resolver generation",
    30_000,
  );
  const payload = (await response.json()) as InteractionResponse;
  const outputText =
    payload.output_text ??
    payload.steps
      ?.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .find((item) => item.type === "text" && item.text)?.text;
  if (!outputText) throw new Error("Resolver response has no text output");
  return JSON.parse(outputText) as unknown;
}
