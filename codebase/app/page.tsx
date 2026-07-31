"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type FlowStatus =
  | "idle"
  | "processing"
  | "resolved"
  | "clarify"
  | "escalated"
  | "out_of_scope";

type Source = {
  id: string;
  threadId: string;
  channel: string;
  author: string;
  time: string;
  excerpt: string;
  relevance: number;
  permalink: string;
};

type ResolverResult = {
  status: Exclude<FlowStatus, "idle" | "processing">;
  understoodAs: string;
  answer: string;
  confidence: number;
  foundCount: number;
  sources: Source[];
  missing?: string;
  taTicket?: string;
  clarifyingQuestion?: string;
  scopeMessage?: string;
  trace: {
    mode: "demo" | "live";
    embeddingModel: string | null;
    resolverModel: string | null;
    retrieved: Array<{
      threadId: string;
      topic: string;
      score: number;
    }>;
    validatedSourceIds: string[];
    rejectedSourceIds: string[];
    latencyMs: number;
  };
};

type Question = {
  id: string;
  author: string;
  initials: string;
  color: string;
  time: string;
  content: string;
  reactions?: string;
};

const questions: Question[] = [
  {
    id: "q-rag",
    author: "Minh Anh",
    initials: "MA",
    color: "#f59e0b",
    time: "09:42",
    content:
      "Em đang phân vân: RAG khác fine-tuning ở điểm nào? Với chatbot hỏi đáp tài liệu thì nên chọn gì ạ?",
    reactions: "2",
  },
  {
    id: "q-temperature",
    author: "Quốc Bảo",
    initials: "QB",
    color: "#10b981",
    time: "09:47",
    content:
      "Tại sao để temperature thấp mà model vẫn hallucinate? Có thread nào giải thích phần này không ạ?",
  },
  {
    id: "q-attention",
    author: "Lan Chi",
    initials: "LC",
    color: "#ec4899",
    time: "09:55",
    content:
      "Em bị lỗi shape mismatch ở bài attention, thử reshape rồi mà vẫn lỗi. Mọi người biết nguyên nhân không?",
  },
];

const flowSteps = [
  { label: "Hiểu câu hỏi", detail: "Chuẩn hoá ý định học tập" },
  { label: "Tìm thảo luận", detail: "Xếp hạng nội dung tương tự" },
  { label: "Kiểm tra căn cứ", detail: "Đủ nguồn để trả lời?" },
  { label: "Tổng hợp hoặc chuyển TA", detail: "Đưa ra bước tiếp theo" },
];

const delay = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export default function Home() {
  const [selectedQuestion, setSelectedQuestion] = useState<Question>(questions[0]);
  const [query, setQuery] = useState(`/ask ${questions[0].content}`);
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [activeStep, setActiveStep] = useState(-1);
  const [result, setResult] = useState<ResolverResult | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [manualEscalation, setManualEscalation] = useState(false);
  const [error, setError] = useState("");

  const cleanQuestion = useMemo(
    () => query.replace(/^\/ask\s*/i, "").trim(),
    [query],
  );

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setScopeOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const chooseQuestion = (question: Question) => {
    if (status === "processing") return;
    setSelectedQuestion(question);
    setQuery(`/ask ${question.content}`);
    setStatus("idle");
    setActiveStep(-1);
    setResult(null);
    setManualEscalation(false);
    setError("");
  };

  const runResolver = async (questionText: string) => {
    if (!questionText || status === "processing") {
      if (!questionText) setError("Hãy nhập câu hỏi sau lệnh /ask.");
      return;
    }

    setStatus("processing");
    setResult(null);
    setManualEscalation(false);
    setError("");

    try {
      for (let step = 0; step < flowSteps.length; step += 1) {
        setActiveStep(step);
        await delay(step === 1 ? 780 : 560);
      }

      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questionText }),
      });

      if (!response.ok) throw new Error("Resolver unavailable");
      const payload = (await response.json()) as ResolverResult;
      setResult(payload);
      setStatus(payload.status);
    } catch {
      setStatus("idle");
      setActiveStep(-1);
      setError("Chưa thể chạy resolver. Hãy thử lại.");
    }
  };

  const submitAsk = (event: FormEvent) => {
    event.preventDefault();
    void runResolver(cleanQuestion);
  };

  const useSlashCommand = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void runResolver(cleanQuestion);
    }
  };

  const escalateToTa = () => {
    setManualEscalation(true);
    setStatus("escalated");
  };

  const resetFlow = () => {
    setStatus("idle");
    setActiveStep(-1);
    setResult(null);
    setManualEscalation(false);
  };

  const answerClarification = () => {
    const currentQuestion = cleanQuestion;
    setStatus("idle");
    setActiveStep(-1);
    setResult(null);
    setQuery(`/ask ${currentQuestion} — `);
  };

  return (
    <main className="app-shell">
      <aside className="guild-rail" aria-label="Danh sách máy chủ">
        <button className="guild guild-active" aria-label="AI Study Lab">
          AI
        </button>
        <span className="rail-divider" />
        <button className="guild guild-muted" aria-label="Khoá học khác">
          K3
        </button>
        <button className="guild guild-add" aria-label="Thêm máy chủ">
          +
        </button>
        <span className="rail-spacer" />
        <div className="user-avatar" title="Bạn đang trực tuyến">
          TD
          <span className="online-dot" />
        </div>
      </aside>

      <aside className="channel-sidebar">
        <div className="workspace-title">
          <div>
            <p>AI Study Lab</p>
            <span>Khoá AI Thực Chiến</span>
          </div>
          <span aria-hidden="true">⌄</span>
        </div>

        <nav aria-label="Kênh Discord">
          <p className="channel-group">KÊNH HỌC TẬP <span>+</span></p>
          <button className="channel-row"><span>#</span> thông-báo</button>
          <Link className="channel-row channel-active" href="/hoi-dap-day2">
            <span>#</span> hỏi-bài-day-2
          </Link>
          <button className="channel-row"><span>#</span> tài-nguyên</button>
          <button className="channel-row"><span>#</span> khoe-bài-làm</button>

          <p className="channel-group channel-gap">HỖ TRỢ <span>+</span></p>
          <button className="channel-row"><span>#</span> ta-support <b>3</b></button>
          <button className="channel-row"><span>#</span> lỗi-kỹ-thuật</button>
        </nav>

        <div className="prototype-note">
          <span className="prototype-dot" />
          <div>
            <strong>Prototype CP3</strong>
            <p>Semantic retrieval có kiểm chứng</p>
          </div>
        </div>
      </aside>

      <section className="conversation-panel">
        <header className="conversation-header">
          <div className="channel-heading">
            <span>#</span>
            <div>
              <strong>hỏi-bài-day-2</strong>
              <p>Hỏi đáp nội dung bài học · dùng /ask để gọi resolver</p>
            </div>
          </div>
          <div className="header-actions">
            <span className="live-pill"><i /> 128 thành viên</span>
            <button className="scope-button" onClick={() => setScopeOpen(true)}>
              Phạm vi CP2
            </button>
          </div>
        </header>

        <div className="demo-banner">
          <span className="sparkle">✦</span>
          <div>
            <strong>Discord Question Resolver</strong>
            <p>
              Chọn một câu hỏi để AI tìm thảo luận tương tự, tổng hợp có nguồn
              hoặc chuyển TA.
            </p>
          </div>
          <span className="banner-badge">FLOW DEMO</span>
        </div>

        <div className="message-list">
          <div className="date-divider"><span>Hôm nay, 30 tháng 7</span></div>
          <article className="message system-message">
            <div className="bot-avatar">QR</div>
            <div className="message-body">
              <div className="message-meta">
                <strong>Question Resolver</strong>
                <span className="app-tag">APP</span>
                <time>09:40</time>
              </div>
              <p>
                Gõ <code>/ask</code> cùng câu hỏi học tập. Mình chỉ tổng hợp khi
                tìm thấy căn cứ và luôn dẫn về tin nhắn gốc.
              </p>
            </div>
          </article>

          {questions.map((question) => (
            <article
              className={`message question-message ${
                selectedQuestion.id === question.id ? "message-selected" : ""
              }`}
              key={question.id}
            >
              <div
                className="member-avatar"
                style={{ backgroundColor: question.color }}
                aria-hidden="true"
              >
                {question.initials}
              </div>
              <div className="message-body">
                <div className="message-meta">
                  <strong>{question.author}</strong>
                  <time>{question.time}</time>
                </div>
                <p>{question.content}</p>
                <div className="message-tools">
                  {question.reactions && (
                    <span className="reaction">🤔 {question.reactions}</span>
                  )}
                  <button
                    onClick={() => chooseQuestion(question)}
                    aria-pressed={selectedQuestion.id === question.id}
                  >
                    {selectedQuestion.id === question.id ? "Đã chọn" : "Hỏi AI"}
                    <span>→</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <form className="ask-composer" onSubmit={submitAsk}>
          <span className="command-mark">/</span>
          <input
            aria-label="Nhập lệnh ask và câu hỏi"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={useSlashCommand}
            placeholder="/ask Nhập câu hỏi học tập…"
          />
          <button
            type="submit"
            disabled={status === "processing"}
            aria-label="Gửi câu hỏi cho resolver"
          >
            {status === "processing" ? "Đang tìm…" : "Gửi /ask"}
          </button>
          {error && <p className="composer-error">{error}</p>}
        </form>
      </section>

      <aside className="resolver-panel" aria-label="Kết quả Question Resolver">
        <header className="resolver-header">
          <div className="resolver-brand">
            <span>✦</span>
            <div>
              <strong>Question Resolver</strong>
              <p>
                {result?.trace.mode === "live"
                  ? "Gemini AI · Semantic retrieval"
                  : "CP3 · Live khi có API key"}
              </p>
            </div>
          </div>
          {(status !== "idle" || result) && (
            <button className="icon-button" onClick={resetFlow} aria-label="Đặt lại">
              ↻
            </button>
          )}
        </header>

        <section className="selected-question-card">
          <p className="eyebrow">CÂU HỎI ĐANG XỬ LÝ</p>
          <blockquote>{cleanQuestion || "Chưa có câu hỏi"}</blockquote>
          <span>từ #{selectedQuestion.id.replace("q-", "")}</span>
        </section>

        <section className="flow-card">
          <div className="section-title-row">
            <p className="eyebrow">FLOW XỬ LÝ</p>
            <span
              className={`status-pill status-${status}`}
              aria-live="polite"
            >
              {status === "idle" && "Sẵn sàng"}
              {status === "processing" && "Đang chạy"}
              {status === "resolved" && "Đủ căn cứ"}
              {status === "clarify" && "Cần hỏi lại"}
              {status === "escalated" && "Cần TA"}
              {status === "out_of_scope" && "Ngoài phạm vi"}
            </span>
          </div>
          <ol className="flow-steps">
            {flowSteps.map((step, index) => {
              const complete =
                status === "resolved" ||
                status === "clarify" ||
                status === "escalated" ||
                status === "out_of_scope" ||
                (status === "processing" && index < activeStep);
              const active = status === "processing" && index === activeStep;
              return (
                <li
                  className={`${complete ? "step-complete" : ""} ${
                    active ? "step-active" : ""
                  }`}
                  key={step.label}
                >
                  <span className="step-marker">
                    {complete ? "✓" : index + 1}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {status === "idle" && !result && (
          <section className="empty-result">
            <div className="empty-orbit"><span>✦</span></div>
            <h2>Sẵn sàng giải quyết câu hỏi</h2>
            <p>
              Chọn một tin nhắn ở bên trái hoặc sửa lệnh <code>/ask</code>, rồi
              nhấn gửi để xem toàn bộ flow.
            </p>
            <button onClick={() => void runResolver(cleanQuestion)}>
              Chạy resolver <span>→</span>
            </button>
          </section>
        )}

        {status === "processing" && (
          <section className="processing-card" aria-live="polite">
            <div className="scan-lines">
              <span />
              <span />
              <span />
            </div>
            <strong>{flowSteps[Math.max(activeStep, 0)].label}…</strong>
            <p>{flowSteps[Math.max(activeStep, 0)].detail}</p>
          </section>
        )}

        {result && status !== "processing" && (
          <section className="result-card">
            <div className="result-topline">
              <div>
                <p className="eyebrow">AI HIỂU CÂU HỎI LÀ</p>
                <strong>{result.understoodAs}</strong>
              </div>
              <div className="confidence">
                <span>{Math.round(result.confidence * 100)}%</span>
                <small>độ tin cậy</small>
              </div>
            </div>
            <div className="trace-strip">
              <span className={`mode-badge mode-${result.trace.mode}`}>
                {result.trace.mode === "live" ? "AI THẬT" : "DEMO"}
              </span>
              <p>
                {result.trace.retrieved.length} thread đã retrieval ·{" "}
                {result.trace.latencyMs} ms
              </p>
            </div>

            {status === "resolved" && !manualEscalation ? (
              <>
                <div className="decision decision-resolved">
                  <span>✓</span>
                  <div>
                    <strong>Đủ căn cứ để tổng hợp</strong>
                    <p>Tìm thấy {result.foundCount} thảo luận liên quan</p>
                  </div>
                </div>
                <div className="answer-block">
                  <p className="eyebrow">CÂU TRẢ LỜI TỔNG HỢP</p>
                  <p>{result.answer}</p>
                </div>
                <div className="source-list">
                  <div className="section-title-row">
                    <p className="eyebrow">NGUỒN TIN NHẮN</p>
                    <span>{result.sources.length} nguồn</span>
                  </div>
                  {result.sources.map((source) => (
                    <Link
                      className="source-card"
                      key={source.id}
                      href={`/hoi-dap-day2#${encodeURIComponent(source.id)}`}
                      aria-label={`Mở tin nhắn nguồn ${source.id} trong lịch sử hội thoại`}
                    >
                      <span className="source-hash">#</span>
                      <span className="source-content">
                        <strong>{source.channel}</strong>
                        <small>{source.author} · {source.time}</small>
                        <p>{source.excerpt}</p>
                      </span>
                      <span className="source-score">
                        {source.relevance}%<small>mở nguồn ↗</small>
                      </span>
                    </Link>
                  ))}
                </div>
                <div className="result-actions">
                  <button className="primary-action" onClick={resetFlow}>
                    ✓ Đã giải quyết
                  </button>
                  <button className="secondary-action" onClick={escalateToTa}>
                    Vẫn chưa rõ · Chuyển TA
                  </button>
                </div>
              </>
            ) : status === "clarify" ? (
              <>
                <div className="decision decision-clarify">
                  <span>?</span>
                  <div>
                    <strong>Cần thêm một thông tin</strong>
                    <p>Chưa chọn nguồn để tránh tìm sai chủ đề</p>
                  </div>
                </div>
                <div className="missing-block">
                  <p className="eyebrow">QUESTION RESOLVER HỎI LẠI</p>
                  <p>
                    {result.clarifyingQuestion ??
                      "Bạn có thể bổ sung bài học hoặc lỗi cụ thể đang hỏi không?"}
                  </p>
                  <p className="clarify-reason">{result.missing}</p>
                </div>
                <button
                  className="primary-action full-action"
                  onClick={answerClarification}
                >
                  Bổ sung câu hỏi
                </button>
              </>
            ) : status === "out_of_scope" ? (
              <>
                <div className="decision decision-scope">
                  <span>↩</span>
                  <div>
                    <strong>Ngoài phạm vi Question Resolver</strong>
                    <p>Không dùng kiến thức chung để trả lời thay nguồn Discord</p>
                  </div>
                </div>
                <div className="missing-block">
                  <p className="eyebrow">PHẠM VI SẢN PHẨM</p>
                  <p>
                    {result.scopeMessage ??
                      "Công cụ chỉ giải quyết câu hỏi học tập từ các kênh được phép."}
                  </p>
                  <ul>
                    <li>Hỏi lại về nội dung học tập</li>
                    <li>Dùng kênh chính thức cho deadline hoặc điểm số</li>
                    <li>Dùng trợ lý khác cho câu hỏi kiến thức chung</li>
                  </ul>
                </div>
                <button className="primary-action full-action" onClick={resetFlow}>
                  Đặt câu hỏi khác
                </button>
              </>
            ) : (
              <>
                <div className="decision decision-escalated">
                  <span>↗</span>
                  <div>
                    <strong>Chưa đủ căn cứ · đã chuyển TA</strong>
                    <p>
                      Ticket {result.taTicket ?? "TA-024"} tại #ta-support
                    </p>
                  </div>
                </div>
                <div className="missing-block">
                  <p className="eyebrow">CONTEXT GỬI KÈM CHO TA</p>
                  <p>
                    {manualEscalation
                      ? "Học viên xác nhận câu trả lời tổng hợp chưa giải quyết được vấn đề."
                      : result.missing}
                  </p>
                  <ul>
                    <li>Câu hỏi gốc và người hỏi</li>
                    <li>{result.foundCount} thảo luận đã kiểm tra</li>
                    <li>Lý do hệ thống chưa thể kết luận</li>
                  </ul>
                </div>
                <button className="primary-action full-action" onClick={resetFlow}>
                  Xong · quay lại kênh
                </button>
              </>
            )}
          </section>
        )}

        <footer className="resolver-footer">
          <span>{result?.trace.mode === "live" ? "Live" : "Demo"}</span>
          <p>
            {result?.trace.mode === "live"
              ? "CP3: embedding + resolver AI thật"
              : "Thêm GEMINI_API_KEY để bật CP3 live"}
          </p>
        </footer>
      </aside>

      {scopeOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setScopeOpen(false)}>
          <section
            className="scope-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scope-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setScopeOpen(false)}
              aria-label="Đóng"
            >
              ×
            </button>
            <p className="eyebrow">MỐC CP3</p>
            <h2 id="scope-title">Phạm vi prototype</h2>
            <p className="modal-lead">
              Bản này chứng minh flow từ semantic retrieval đến một quyết định
              có căn cứ, kèm đường dẫn về đúng tin nhắn nguồn.
            </p>
            <div className="scope-grid">
              <div className="scope-column scope-in">
                <span>TRONG PHẠM VI</span>
                <ul>
                  <li>Chọn câu hỏi hoặc nhập lệnh /ask</li>
                  <li>Tìm và xếp hạng thảo luận bằng embedding</li>
                  <li>Tổng hợp câu trả lời kèm nguồn gốc</li>
                  <li>Hai nhánh: đã giải quyết hoặc chuyển TA</li>
                </ul>
              </div>
              <div className="scope-column scope-out">
                <span>CHƯA LÀM Ở CP3</span>
                <ul>
                  <li>Chưa kết nối Discord hoặc đọc tin nhắn thật</li>
                  <li>Chưa gửi thông báo thật đến TA</li>
                  <li>Không đọc DM, kênh riêng tư hoặc lưu dữ liệu người dùng</li>
                  <li>Không xử lý điểm số, deadline hay khiếu nại hành chính</li>
                </ul>
              </div>
            </div>
            <button className="primary-action modal-action" onClick={() => setScopeOpen(false)}>
              Đã hiểu phạm vi
            </button>
          </section>
        </div>
      )}

    </main>
  );
}
