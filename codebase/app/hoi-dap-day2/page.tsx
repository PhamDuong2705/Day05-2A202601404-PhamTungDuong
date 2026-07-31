import corpus from "../../data/discussions.json";
import type { DiscussionThread } from "../../lib/contracts";
import Link from "next/link";

const learningThreads = (corpus.threads as DiscussionThread[]).filter(
  (thread) => thread.scope === "learning",
);

function initials(author: string) {
  return author
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("vi");
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export default function DiscussionHistoryPage() {
  const messageCount = learningThreads.reduce(
    (total, thread) => total + thread.messages.length,
    0,
  );

  return (
    <main className="app-shell history-shell">
      <aside className="guild-rail" aria-label="Danh sách máy chủ">
        <Link className="guild guild-active" href="/" aria-label="AI Study Lab">
          AI
        </Link>
        <span className="rail-divider" />
        <span className="guild guild-muted" aria-hidden="true">K3</span>
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
          <span className="channel-row"><span>#</span> thông-báo</span>
          <Link className="channel-row channel-active" href="/hoi-dap-day2">
            <span>#</span> hỏi-bài-day-2
          </Link>
          <span className="channel-row"><span>#</span> tài-nguyên</span>
          <span className="channel-row"><span>#</span> khoe-bài-làm</span>

          <p className="channel-group channel-gap">CÔNG CỤ</p>
          <Link className="channel-row resolver-link" href="/">
            <span>✦</span> Question Resolver
          </Link>
        </nav>

        <div className="prototype-note">
          <span className="prototype-dot prototype-dot-live" />
          <div>
            <strong>Kho nguồn CP3</strong>
            <p>{messageCount} tin nhắn đã index</p>
          </div>
        </div>
      </aside>

      <section className="history-panel">
        <header className="history-header">
          <div className="channel-heading">
            <span>#</span>
            <div>
              <strong>hỏi-bài-day-2</strong>
              <p>Cuộn lịch sử hoặc mở nguồn từ câu trả lời của AI</p>
            </div>
          </div>
          <Link className="history-resolver-button" href="/">
            ✦ Hỏi Question Resolver
          </Link>
        </header>

        <div className="history-summary">
          <div>
            <p className="eyebrow">LỊCH SỬ ĐÃ ĐƯỢC INDEX</p>
            <h1>Các thảo luận học tập trước đó</h1>
            <p>
              Mỗi source card của AI liên kết tới đúng message ID tại đây. Tin
              nhắn được chọn sẽ tự cuộn vào màn hình và được highlight.
            </p>
          </div>
          <div className="history-stats" aria-label="Thống kê kho thảo luận">
            <strong>{learningThreads.length}</strong>
            <span>threads</span>
            <strong>{messageCount}</strong>
            <span>messages</span>
          </div>
        </div>

        <div className="history-scroll">
          <div className="history-jump-hint">
            <span>↳</span>
            <p>
              Bạn có thể cuộn tự do. Khi đi từ source card, tin nhắn nguồn có
              viền tím và nhãn <strong>NGUỒN AI ĐÃ CHỌN</strong>.
            </p>
          </div>

          {learningThreads.map((thread) => (
            <section className="archive-thread" key={thread.thread_id}>
              <header className="archive-thread-header">
                <div>
                  <span>#{thread.channel}</span>
                  <strong>{thread.topic.replaceAll("-", " ")}</strong>
                </div>
                <div className="thread-flags">
                  <span>{thread.thread_id}</span>
                  <span className={thread.resolved ? "flag-resolved" : "flag-open"}>
                    {thread.resolved ? "Đã giải quyết" : "Cần thêm thông tin"}
                  </span>
                </div>
              </header>

              <div className="archive-messages">
                {thread.messages.map((message) => (
                  <article
                    className={`archive-message role-${message.author_role}`}
                    id={message.message_id}
                    key={message.message_id}
                    tabIndex={-1}
                  >
                    <div className="member-avatar archive-avatar">
                      {initials(message.author)}
                    </div>
                    <div className="archive-message-body">
                      <div className="message-meta">
                        <strong>{message.author}</strong>
                        {message.author_role !== "student" && (
                          <span className="app-tag">
                            {message.author_role === "ta" ? "TA" : "STAFF"}
                          </span>
                        )}
                        <time>{messageTime(message.created_at)}</time>
                        <code>{message.message_id}</code>
                      </div>
                      <p>{message.content}</p>
                    </div>
                    <span className="target-label">NGUỒN AI ĐÃ CHỌN</span>
                  </article>
                ))}
              </div>
            </section>
          ))}

          <div className="history-end">
            <span>✓</span>
            <strong>Bạn đã xem hết lịch sử được index</strong>
            <Link href="/">Quay lại Question Resolver →</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
