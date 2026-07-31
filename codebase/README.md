# Discord Question Resolver — Prototype CP3

Luồng chính:

`/ask` → semantic retrieval → kiểm tra căn cứ bằng AI → tổng hợp có nguồn, hỏi lại, chuyển TA hoặc từ chối ngoài phạm vi.

## Chạy local

Yêu cầu Node.js `>= 22.13.0`.

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Bật AI thật

Copy `.env.example` thành `.env.local`, sau đó điền key ở máy cá nhân:

```env
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_RESOLVER_MODEL=gemini-3.6-flash
```

Không commit `.env.local` hoặc API key.

- Có key: `trace.mode = "live"`, dùng embedding và resolver Gemini thật.
- Không có key: `trace.mode = "demo"`, dùng lexical retrieval và quyết định mô phỏng để UI vẫn demo được.

## Kiến trúc CP3

1. Backend gom 26 thread mô phỏng trong `data/discussions.json`.
2. Gemini Embedding 2 mã hoá corpus và câu hỏi.
3. Retrieval xếp hạng theo `75% semantic + 25% lexical`.
4. Gemini 3.6 Flash đọc câu hỏi và top 5 thread, trả JSON có schema.
5. Backend loại source ID không tồn tại và không cho `resolved` khi thiếu nguồn.
6. UI hiển thị trace, nguồn và bước tiếp theo.

## Bốn quyết định

- `resolved`: đủ nguồn, trả lời và dẫn message gốc.
- `clarify`: câu hỏi mơ hồ, hỏi lại đúng một câu.
- `escalated`: đúng phạm vi nhưng thiếu hoặc mâu thuẫn nguồn.
- `out_of_scope`: ngoài phạm vi học tập; không tự chuyển sang kiến thức chung.

## Các case kiểm tra nhanh

```text
resolved:     RAG khác fine-tuning như thế nào?
clarify:      Cái này làm sao vậy?
escalated:    Em bị shape mismatch trong bài attention nhưng chưa có code.
out_of_scope: Mai thời tiết ở Hà Nội có mưa không?
```

## API

`POST /api/resolve`

```json
{
  "question": "RAG khác fine-tuning như thế nào?"
}
```

Response có `status`, `sources` và `trace`. Trace ghi mode, model, top thread, similarity score, source ID được chấp nhận hoặc bị loại và latency; không chứa API key.

## Kiểm tra

```bash
npm test
```

Test hiện kiểm tra SSR, bốn đường quyết định ở demo mode và giới hạn độ dài input.

## Phần thật và phần mock

Khi có API key:

- Thật: embedding, hybrid retrieval, structured AI decision, backend validation.
- Mock: corpus Discord, message permalink và ticket gửi TA.

Prototype không đọc Discord thật, DM hoặc kênh riêng tư; không gửi ticket thật và không lưu dữ liệu người dùng.
