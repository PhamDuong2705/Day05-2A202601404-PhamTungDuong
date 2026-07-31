import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [targetArg, lessonsArg, sharesArg] = process.argv.slice(2);

if (!targetArg || !lessonsArg || !sharesArg) {
  console.error(
    "Usage: node scripts/import-content-posts.mjs <discussions.json> <baihoc.json> <chiase.json>",
  );
  process.exit(1);
}

const GUILD_ID = "1526532830627102781";
const ACTIVE_THREAD_LIMIT = 90;
const RELEVANCE_TERMS = [
  ["rag", 8],
  ["embedding", 8],
  ["retrieval", 8],
  ["fine-tuning", 7],
  ["hallucination", 7],
  ["llm", 7],
  ["eval", 7],
  ["prompt", 6],
  ["agent", 6],
  ["validation", 6],
  ["spec", 6],
  ["mcp", 6],
  ["coding", 5],
  ["machine learning", 5],
  ["deep learning", 5],
  ["computer vision", 5],
  ["nlp", 5],
  ["ai", 4],
  ["model", 4],
  ["code", 4],
  ["github", 4],
  ["git ", 4],
  ["api", 4],
  ["data", 3],
  ["vibe", 3],
  ["project", 3],
  ["hackathon", 3],
];

function slugify(title) {
  return title
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9+#]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalize(text) {
  return text
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function relevanceScore(thread) {
  const title = normalize(
    thread.messages[0]?.content.split("\n")[0] ?? thread.topic,
  );
  return RELEVANCE_TERMS.reduce(
    (score, [term, weight]) => score + (title.includes(term) ? weight : 0),
    0,
  );
}

function validatePost(post, sourceName, index) {
  for (const field of ["id", "title", "created_at"]) {
    if (typeof post[field] !== "string" || !post[field].trim()) {
      throw new Error(
        `${sourceName}[${index}] thiếu trường chuỗi bắt buộc: ${field}`,
      );
    }
  }
  if (
    post.content !== null &&
    post.content !== undefined &&
    typeof post.content !== "string"
  ) {
    throw new Error(`${sourceName}[${index}].content phải là chuỗi hoặc null`);
  }
}

function toThread(post, { prefix, channel }) {
  const id = post.id.trim();
  const title = post.title.trim();
  const content = post.content?.trim();

  return {
    thread_id: `${prefix}-${id}`,
    channel,
    topic: slugify(title) || `${prefix.toLocaleLowerCase()}-${id}`,
    scope: "learning",
    resolved: true,
    official_answer: false,
    permalink: `https://discord.com/channels/${GUILD_ID}/${id}/${id}`,
    messages: [
      {
        message_id: id,
        author: "Tác giả bài đăng",
        author_role: "student",
        created_at: post.created_at,
        content: content ? `${title}\n\n${content}` : title,
      },
    ],
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

const targetPath = resolve(targetArg);
const corpus = await readJson(targetPath);
const lessonPosts = await readJson(lessonsArg);
const sharePosts = await readJson(sharesArg);

if (!Array.isArray(corpus.threads)) {
  throw new Error("discussions.json không có mảng threads");
}
if (!Array.isArray(lessonPosts) || !Array.isArray(sharePosts)) {
  throw new Error("baihoc.json và chiase.json phải là mảng JSON");
}

lessonPosts.forEach((post, index) => validatePost(post, "baihoc", index));
sharePosts.forEach((post, index) => validatePost(post, "chiase", index));

const existingThreads = [
  ...corpus.threads,
  ...(Array.isArray(corpus.archive_threads) ? corpus.archive_threads : []),
];
const existingMessageIds = new Set(
  existingThreads.flatMap((thread) =>
    thread.messages.map((message) => String(message.message_id)),
  ),
);
const seenInputPosts = new Map();
let duplicateInputRows = 0;

const sources = [
  {
    posts: lessonPosts,
    options: { prefix: "BH", channel: "📚-bài-học" },
  },
  {
    posts: sharePosts,
    options: { prefix: "CS", channel: "💬-chia-sẻ" },
  },
];

const imported = [];
for (const { posts, options } of sources) {
  for (const post of posts) {
    const id = post.id.trim();
    const normalizedPost = JSON.stringify({
      title: post.title.trim(),
      content: post.content?.trim() ?? null,
      created_at: post.created_at.trim(),
    });
    const existingInput = seenInputPosts.get(id);
    if (existingInput) {
      if (existingInput !== normalizedPost) {
        throw new Error(`ID ${id} có hai nội dung khác nhau trong file nguồn`);
      }
      duplicateInputRows += 1;
      continue;
    }
    seenInputPosts.set(id, normalizedPost);
    if (!existingMessageIds.has(id)) {
      imported.push(toThread(post, options));
    }
  }
}

corpus.threads.push(...imported);

const allThreads = [
  ...corpus.threads,
  ...(Array.isArray(corpus.archive_threads) ? corpus.archive_threads : []),
];
const uniqueThreads = [
  ...new Map(allThreads.map((thread) => [thread.thread_id, thread])).values(),
];
const baseThreads = uniqueThreads.filter(
  (thread) =>
    !thread.thread_id.startsWith("BH-") &&
    !thread.thread_id.startsWith("CS-"),
);
const lessonThreads = uniqueThreads.filter((thread) =>
  thread.thread_id.startsWith("BH-"),
);
const shareThreads = uniqueThreads
  .filter((thread) => thread.thread_id.startsWith("CS-"))
  .sort(
    (left, right) =>
      relevanceScore(right) - relevanceScore(left) ||
      String(right.messages[0]?.created_at).localeCompare(
        String(left.messages[0]?.created_at),
      ) ||
      left.thread_id.localeCompare(right.thread_id),
  );
const activeShareCount = Math.max(
  0,
  ACTIVE_THREAD_LIMIT - baseThreads.length - lessonThreads.length,
);

corpus.dataset = "discord-resolver-free-tier-v4";
corpus.description =
  "Corpus hoạt động tối ưu cho Gemini free-tier: 39 thread hỏi đáp, 22 bài học và 29 bài chia sẻ sát chủ đề AI/RAG/coding/spec/eval. Giới hạn 90 threads chừa quota cho embedding câu hỏi; Discord ID, nội dung, thời gian và permalink được giữ để truy nguồn.";
corpus.threads = [
  ...baseThreads,
  ...lessonThreads,
  ...shareThreads.slice(0, activeShareCount),
];
corpus.archive_description =
  "Các bài chia sẻ còn lại vẫn được giữ trong file nhưng không đưa vào embedding/retrieval để tránh vượt quota free-tier.";
corpus.archive_threads = shareThreads.slice(activeShareCount);

await writeFile(targetPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify({
    imported: imported.length,
    duplicate_input_rows: duplicateInputRows,
    skipped_existing:
      seenInputPosts.size - imported.length,
    active_threads: corpus.threads.length,
    archived_threads: corpus.archive_threads.length,
  }),
);
