import type {
  ModelResolverOutput,
  ResolverResponse,
  ResolverSource,
  RetrievalCandidate,
} from "./contracts";
import {
  DEFAULT_RESOLVER_MODEL,
  generateStructuredJson,
} from "./gemini";
import { retrieveDiscussions } from "./retrieval";

const resolverSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    understood_as: {
      type: "string",
      description: "Diễn giải ngắn gọn ý định thực sự của câu hỏi.",
    },
    decision: {
      type: "string",
      enum: ["resolved", "clarify", "escalate", "out_of_scope"],
      description: "Đường xử lý phù hợp theo quy tắc của Question Resolver.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Mức tin cậy vào quyết định, từ 0 đến 1.",
    },
    answer: {
      type: ["string", "null"],
      description:
        "Câu trả lời tổng hợp chỉ từ nguồn được cung cấp; null nếu không resolved.",
    },
    source_message_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "Danh sách message ID thực sự hỗ trợ các kết luận trong answer.",
    },
    missing_information: {
      type: ["string", "null"],
      description: "Thông tin còn thiếu nếu phải clarify hoặc escalate.",
    },
    clarification_question: {
      type: ["string", "null"],
      description: "Một câu hỏi ngắn cần hỏi lại người dùng.",
    },
    reason: {
      type: "string",
      description: "Lý do kiểm chứng được cho quyết định.",
    },
  },
  required: [
    "understood_as",
    "decision",
    "confidence",
    "answer",
    "source_message_ids",
    "missing_information",
    "clarification_question",
    "reason",
  ],
} as const;

function promptFor(question: string, candidates: RetrievalCandidate[]) {
  const evidence = candidates
    .map(
      (candidate, index) => `
SOURCE ${index + 1}
thread_id: ${candidate.thread_id}
channel: ${candidate.channel}
topic: ${candidate.topic}
scope: ${candidate.scope}
resolved_in_thread: ${candidate.resolved}
official_answer_present: ${candidate.official_answer}
retrieval_score: ${candidate.score.toFixed(4)}
messages:
${candidate.messages
  .map(
    (message) =>
      `[${message.message_id}] ${message.author_role}/${message.author}: ${message.content}`,
  )
  .join("\n")}`,
    )
    .join("\n---\n");

  return `
Bạn là Discord Question Resolver cho một khoá học AI.

NHIỆM VỤ TRUNG TÂM
Quyết định các thảo luận được cung cấp có đủ căn cứ để giải quyết câu hỏi học tập hay không.

PHẠM VI
- Chỉ xử lý câu hỏi học tập thuộc khoá.
- Deadline, điểm số, khiếu nại, thời tiết và yêu cầu đáp án bài kiểm tra đang mở là ngoài phạm vi.
- Không dùng kiến thức nền của model để lấp phần nguồn còn thiếu.

QUY TẮC QUYẾT ĐỊNH
- resolved: câu hỏi rõ, có nguồn trả lời trực tiếp và không có mâu thuẫn quan trọng.
- clarify: câu hỏi mơ hồ; cần hỏi đúng một câu để biết user đang nói về nội dung nào.
- escalate: đúng phạm vi học tập nhưng nguồn thiếu, mâu thuẫn hoặc cần xem code/dữ liệu cụ thể.
- out_of_scope: ngoài phạm vi ở trên.

QUY TẮC NGUỒN
- Chỉ trích message_id xuất hiện trong SOURCES.
- Mọi kết luận quan trọng trong answer phải được source_message_ids hỗ trợ.
- Không chọn nguồn chỉ trùng từ nhưng khác nghĩa, ví dụ GPU temperature khác sampling temperature hoặc React Context khác LLM context window.
- Nếu decision không phải resolved thì answer phải null.
- Nếu decision là resolved thì source_message_ids phải có ít nhất một ID.

QUESTION
${question}

SOURCES
${evidence}

Trả về đúng JSON theo schema, không thêm markdown.
`.trim();
}

function clampConfidence(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, parsed));
}

function sourceFromMessage(
  candidate: RetrievalCandidate,
  messageId: string,
): ResolverSource | null {
  const message = candidate.messages.find(
    (item) => item.message_id === messageId,
  );
  if (!message) return null;
  return {
    id: message.message_id,
    threadId: candidate.thread_id,
    channel: candidate.channel,
    author: message.author,
    time: new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(message.created_at)),
    excerpt: message.content,
    relevance: Math.round(candidate.score * 100),
    permalink: candidate.permalink,
  };
}

function validateModelOutput(
  output: ModelResolverOutput,
  candidates: RetrievalCandidate[],
  traceBase: Omit<ResolverResponse["trace"], "validatedSourceIds" | "rejectedSourceIds">,
): ResolverResponse {
  const candidateByMessage = new Map<
    string,
    { candidate: RetrievalCandidate }
  >();
  for (const candidate of candidates) {
    for (const message of candidate.messages) {
      candidateByMessage.set(message.message_id, { candidate });
    }
  }

  const requestedIds = Array.isArray(output.source_message_ids)
    ? [...new Set(output.source_message_ids.filter((id) => typeof id === "string"))]
    : [];
  const validIds = requestedIds.filter((id) => candidateByMessage.has(id));
  const rejectedIds = requestedIds.filter((id) => !candidateByMessage.has(id));
  const sources = validIds
    .map((id) => {
      const item = candidateByMessage.get(id);
      return item ? sourceFromMessage(item.candidate, id) : null;
    })
    .filter((source): source is ResolverSource => source !== null);

  const confidence = clampConfidence(output.confidence);
  const understoodAs =
    typeof output.understood_as === "string" && output.understood_as.trim()
      ? output.understood_as.trim()
      : "Câu hỏi học tập cần được kiểm tra thêm";
  const trace = {
    ...traceBase,
    validatedSourceIds: validIds,
    rejectedSourceIds: rejectedIds,
  };

  if (output.decision === "resolved" && sources.length > 0 && output.answer) {
    return {
      status: "resolved",
      understoodAs,
      answer: output.answer.trim(),
      confidence,
      foundCount: candidates.length,
      sources,
      trace,
    };
  }

  if (output.decision === "clarify") {
    return {
      status: "clarify",
      understoodAs,
      answer: "",
      confidence,
      foundCount: candidates.length,
      sources: [],
      missing:
        output.missing_information ??
        "Câu hỏi chưa có đủ ngữ cảnh để tìm đúng thảo luận.",
      clarifyingQuestion:
        output.clarification_question ??
        "Bạn đang hỏi về bài học hoặc lỗi cụ thể nào?",
      trace,
    };
  }

  if (output.decision === "out_of_scope") {
    return {
      status: "out_of_scope",
      understoodAs,
      answer: "",
      confidence,
      foundCount: candidates.length,
      sources: [],
      scopeMessage:
        "Question Resolver chỉ tìm và tổng hợp câu hỏi học tập từ các kênh được phép. Câu hỏi này cần dùng kênh hoặc công cụ phù hợp khác.",
      trace,
    };
  }

  return {
    status: "escalated",
    understoodAs,
    answer: "",
    confidence,
    foundCount: candidates.length,
    sources: [],
    missing:
      output.decision === "resolved"
        ? "Model chọn resolved nhưng không cung cấp source ID hợp lệ; backend đã chặn câu trả lời."
        : output.missing_information ??
          "Các thảo luận tìm được chưa đủ để kết luận.",
    taTicket: ticketFor(understoodAs),
    trace,
  };
}

function ticketFor(input: string) {
  const checksum = [...input].reduce(
    (sum, character) => (sum + character.charCodeAt(0)) % 900,
    0,
  );
  return `TA-${String(checksum + 100).padStart(3, "0")}`;
}

function isClearlyAmbiguous(question: string) {
  const normalized = question.toLocaleLowerCase("vi").trim();
  return (
    normalized.length < 14 ||
    /^(cái này|cai nay|làm sao|lam sao|giúp với|help)/.test(normalized) ||
    /(slide này|slide nay|đoạn này|doan nay|nội dung này|noi dung nay)/.test(
      normalized,
    ) ||
    /^(cách xử lý ngữ cảnh|cach xu ly ngu canh)[?.!]*$/.test(normalized)
  );
}

function demoModelOutput(
  question: string,
  candidates: RetrievalCandidate[],
): ModelResolverOutput {
  const normalized = question.toLocaleLowerCase("vi").trim();
  const top = candidates[0];

  if (isClearlyAmbiguous(question)) {
    return {
      understood_as: "Câu hỏi đang thiếu đối tượng hoặc bối cảnh",
      decision: "clarify",
      confidence: 0.45,
      answer: null,
      source_message_ids: [],
      missing_information: "Chưa biết người học đang nói đến bài, khái niệm hay lỗi nào.",
      clarification_question:
        "Bạn đang hỏi về bài học, đoạn code hoặc lỗi cụ thể nào?",
      reason: "Input quá ngắn để chọn đúng thảo luận.",
    };
  }

  if (
    /(prompt catch(ing)?|prompt cach(ing)?|tool calling)/.test(normalized)
  ) {
    return {
      understood_as: "Câu hỏi học tập chưa có nguồn trả lời trực tiếp trong corpus",
      decision: "escalate",
      confidence: 0.4,
      answer: null,
      source_message_ids: [],
      missing_information:
        "Các thảo luận hiện có không chứa chủ đề này hoặc thuật ngữ có thể đang bị viết nhầm.",
      clarification_question: null,
      reason: "Không dùng thread chỉ trùng từ chung để suy ra câu trả lời.",
    };
  }

  if (
    /(thời tiết|thoi tiet|deadline|điểm số|diem so|đáp án|dap an|bài kiểm tra)/.test(
      normalized,
    ) ||
    top?.scope === "off_topic" ||
    top?.scope === "logistics" ||
    top?.scope === "restricted"
  ) {
    return {
      understood_as: "Yêu cầu nằm ngoài phạm vi giải đáp học tập có căn cứ",
      decision: "out_of_scope",
      confidence: 0.92,
      answer: null,
      source_message_ids: [],
      missing_information: null,
      clarification_question: null,
      reason: "Câu hỏi thuộc logistics, ngoài lề hoặc nội dung bị giới hạn.",
    };
  }

  if (!top || top.score < 0.08 || !top.resolved) {
    return {
      understood_as: top
        ? `Câu hỏi gần với chủ đề ${top.topic} nhưng thiếu thông tin`
        : "Câu hỏi học tập chưa có nguồn tương ứng",
      decision: "escalate",
      confidence: 0.42,
      answer: null,
      source_message_ids: [],
      missing_information:
        top?.messages.at(-1)?.content ??
        "Không tìm thấy thảo luận trả lời trực tiếp.",
      clarification_question: null,
      reason: "Nguồn gần nhất chưa xác nhận đã giải quyết.",
    };
  }

  const answerMessage =
    [...top.messages]
      .reverse()
      .find((message) => message.author_role !== "student") ??
    top.messages.at(-1);

  if (!answerMessage) {
    return {
      understood_as: "Câu hỏi học tập chưa có câu trả lời",
      decision: "escalate",
      confidence: 0.35,
      answer: null,
      source_message_ids: [],
      missing_information: "Thread không có message trả lời.",
      clarification_question: null,
      reason: "Không có message để tổng hợp.",
    };
  }

  return {
    understood_as: `Câu hỏi về ${top.topic.replace(/-/g, " ")}`,
    decision: "resolved",
    confidence: Math.max(0.55, Math.min(0.9, top.score + 0.45)),
    answer: answerMessage.content,
    source_message_ids: [answerMessage.message_id],
    missing_information: null,
    clarification_question: null,
    reason: "Nguồn gần nhất trả lời trực tiếp câu hỏi.",
  };
}

export async function resolveQuestion(question: string): Promise<ResolverResponse> {
  const startedAt = Date.now();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const forceDemo = process.env.RESOLVER_MODE === "demo";
  const liveApiKey = apiKey && !forceDemo ? apiKey : undefined;

  if (isClearlyAmbiguous(question)) {
    return {
      status: "clarify",
      understoodAs: "Câu hỏi đang thiếu đối tượng hoặc bối cảnh",
      answer: "",
      confidence: 0.98,
      foundCount: 0,
      sources: [],
      missing: "Chưa biết người học muốn tóm tắt hoặc giải thích nội dung nào.",
      clarifyingQuestion:
        "Bạn muốn hỏi về bài học, đoạn code, slide hoặc lỗi cụ thể nào?",
      trace: {
        mode: liveApiKey ? "live" : "demo",
        embeddingModel: null,
        resolverModel: null,
        retrieved: [],
        validatedSourceIds: [],
        rejectedSourceIds: [],
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  let retrieval;
  try {
    retrieval = await retrieveDiscussions({
      question,
      apiKey: liveApiKey,
      topK: 5,
    });
  } catch (error) {
    console.error("[resolver] discussion retrieval failed", error);
    return {
      status: "escalated",
      understoodAs: "Không thể truy xuất nguồn học tập lúc này",
      answer: "",
      confidence: 0,
      foundCount: 0,
      sources: [],
      missing:
        "Dịch vụ embedding tạm thời không khả dụng; hệ thống không tự đoán khi chưa có nguồn.",
      taTicket: ticketFor(question),
      trace: {
        mode: liveApiKey ? "live" : "demo",
        embeddingModel: liveApiKey ? "gemini-embedding-2" : null,
        resolverModel: liveApiKey ? DEFAULT_RESOLVER_MODEL : null,
        retrieved: [],
        validatedSourceIds: [],
        rejectedSourceIds: [],
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const traceBase = {
    mode: retrieval.mode,
    embeddingModel: retrieval.embeddingModel,
    resolverModel: liveApiKey ? DEFAULT_RESOLVER_MODEL : null,
    retrieved: retrieval.candidates.map((candidate) => ({
      threadId: candidate.thread_id,
      topic: candidate.topic,
      score: Number(candidate.score.toFixed(4)),
      semanticScore:
        candidate.semanticScore === null
          ? null
          : Number(candidate.semanticScore.toFixed(4)),
      lexicalScore: Number(candidate.lexicalScore.toFixed(4)),
    })),
    latencyMs: 0,
  };

  let modelOutput: ModelResolverOutput;
  if (liveApiKey) {
    try {
      modelOutput = (await generateStructuredJson({
        apiKey: liveApiKey,
        prompt: promptFor(question, retrieval.candidates),
        schema: resolverSchema,
      })) as ModelResolverOutput;
    } catch {
      modelOutput = {
        understood_as: "Không thể hoàn tất quyết định AI lúc này",
        decision: "escalate",
        confidence: 0,
        answer: null,
        source_message_ids: [],
        missing_information:
          "Dịch vụ resolver không trả được kết quả hợp lệ; cần TA kiểm tra.",
        clarification_question: null,
        reason: "AI service or structured output failure.",
      };
    }
  } else {
    modelOutput = demoModelOutput(question, retrieval.candidates);
  }

  return validateModelOutput(modelOutput, retrieval.candidates, {
    ...traceBase,
    latencyMs: Date.now() - startedAt,
  });
}
