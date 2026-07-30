# Discord Question Resolver — Prototype CP2

Prototype bấm được để minh hoạ flow:

`/ask` → hiểu câu hỏi → tìm thảo luận tương tự → kiểm tra đủ căn cứ → tổng hợp có nguồn hoặc chuyển TA.

## Chạy local

```bash
npm install
npm run dev
```

## Hai luồng demo

1. Chọn câu hỏi về **RAG/fine-tuning** hoặc **temperature/hallucination** để xem nhánh đủ căn cứ, câu trả lời tổng hợp và các tin nhắn nguồn.
2. Chọn câu hỏi **shape mismatch** để xem nhánh chưa đủ căn cứ và ticket chuyển TA.

## Trong phạm vi CP2

- Chọn câu hỏi trong kênh hoặc nhập `/ask`.
- Backend mô phỏng việc tìm, xếp hạng và đánh giá thảo luận.
- Tổng hợp câu trả lời kèm bản xem trước tin nhắn gốc.
- Chuyển TA khi chưa đủ căn cứ hoặc khi học viên chọn “Vẫn chưa rõ”.
- Giao diện responsive, có thể demo trên laptop và điện thoại.

## Chưa làm ở CP2

- Chưa kết nối Discord API hoặc đọc lịch sử tin nhắn thật.
- Chưa gọi model AI hay embedding thật — phần này thuộc CP3.
- Chưa gửi notification/ticket thật cho TA.
- Không đọc DM hoặc kênh riêng tư; không lưu dữ liệu người dùng.
- Không xử lý điểm số, deadline, khiếu nại hoặc nội dung hành chính.

## Backend mô phỏng

`POST /api/resolve`

```json
{
  "question": "RAG khác fine-tuning như thế nào?"
}
```

API trả một trong hai trạng thái:

- `resolved`: có câu trả lời, độ tin cậy và danh sách nguồn.
- `escalated`: chưa đủ ngữ cảnh, kèm lý do và mã ticket TA.
