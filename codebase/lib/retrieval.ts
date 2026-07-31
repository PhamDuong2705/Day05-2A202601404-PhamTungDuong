import corpus from "../data/discussions.json";
import type { DiscussionThread, RetrievalCandidate } from "./contracts";
import {
  DEFAULT_EMBEDDING_MODEL,
  embedMany,
  embedOne,
} from "./gemini";

const threads = corpus.threads as DiscussionThread[];

let cachedDocumentVectors:
  | Promise<Array<{ threadId: string; vector: number[] }>>
  | undefined;

const stopWords = new Set([
  "ai",
  "cai",
  "cho",
  "co",
  "cua",
  "duoc",
  "em",
  "gi",
  "hinh",
  "khong",
  "la",
  "lam",
  "kem",
  "mo",
  "mot",
  "nao",
  "nhung",
  "o",
  "phai",
  "tai",
  "the",
  "thi",
  "tot",
  "va",
  "voi",
  "dang",
]);

export function threadSearchText(thread: DiscussionThread) {
  return [
    `Chủ đề: ${thread.topic}`,
    `Kênh: ${thread.channel}`,
    ...thread.messages.map(
      (message) =>
        `[${message.message_id}] ${message.author_role}: ${message.content}`,
    ),
  ].join("\n");
}

function normalize(text: string) {
  return text
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9+#.-]+/g, " ")
    .trim();
}

function tokenSet(text: string) {
  return new Set(
    normalize(text)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

export function lexicalSimilarity(query: string, document: string) {
  const queryTokens = tokenSet(query);
  const documentTokens = tokenSet(document);
  if (!queryTokens.size || !documentTokens.size) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (documentTokens.has(token)) overlap += 1;
  }
  return overlap / Math.sqrt(queryTokens.size * documentTokens.size);
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

async function getDocumentVectors(apiKey: string) {
  cachedDocumentVectors ??= (async () => {
    const vectors = await embedMany({
      apiKey,
      documents: threads.map((thread) => ({
        title: `${thread.topic} - ${thread.channel}`,
        text: threadSearchText(thread),
      })),
    });
    return vectors.map((vector, index) => ({
      threadId: threads[index].thread_id,
      vector,
    }));
  })();
  return cachedDocumentVectors;
}

export async function retrieveDiscussions({
  question,
  apiKey,
  topK = 5,
}: {
  question: string;
  apiKey?: string;
  topK?: number;
}): Promise<{
  candidates: RetrievalCandidate[];
  mode: "demo" | "live";
  embeddingModel: string | null;
}> {
  const searchTexts = new Map(
    threads.map((thread) => [thread.thread_id, threadSearchText(thread)]),
  );

  if (!apiKey) {
    const candidates = threads
      .map((thread) => {
        const searchText = searchTexts.get(thread.thread_id) ?? "";
        const lexicalScore = lexicalSimilarity(question, searchText);
        return {
          ...thread,
          searchText,
          semanticScore: null,
          lexicalScore,
          score: lexicalScore,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
    return { candidates, mode: "demo", embeddingModel: null };
  }

  const [queryVector, documentVectors] = await Promise.all([
    embedOne({
      apiKey,
      text: question,
      taskType: "RETRIEVAL_QUERY",
    }),
    getDocumentVectors(apiKey),
  ]);
  const vectorsByThread = new Map(
    documentVectors.map((item) => [item.threadId, item.vector]),
  );

  const candidates = threads
    .map((thread) => {
      const searchText = searchTexts.get(thread.thread_id) ?? "";
      const lexicalScore = lexicalSimilarity(question, searchText);
      const semanticScore = cosineSimilarity(
        queryVector,
        vectorsByThread.get(thread.thread_id) ?? [],
      );
      return {
        ...thread,
        searchText,
        semanticScore,
        lexicalScore,
        score: semanticScore * 0.75 + lexicalScore * 0.25,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);

  return {
    candidates,
    mode: "live",
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
  };
}
