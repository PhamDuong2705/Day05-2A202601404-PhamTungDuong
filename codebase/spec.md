# Discord Question Resolver — CP3 specification

## 1. Pain cần chứng minh

Trong kênh học tập Discord, cùng một câu hỏi có thể đã được giải đáp nhưng bị chìm trong lịch sử chat. Người học phải tìm lại thủ công; TA phải trả lời lặp lại và vẫn có nguy cơ câu trả lời mới không dẫn được về căn cứ ban đầu.

CP3 cần chứng minh ba điều:

1. hệ thống tìm được thảo luận cùng nghĩa, không chỉ trùng từ;
2. câu trả lời tổng hợp chỉ dùng message có thật và mở được link gốc;
3. khi câu hỏi mơ hồ hoặc nguồn chưa đủ, hệ thống không đoán mà hỏi lại/chuyển TA.

## 2. Phạm vi

### Làm trong CP3

- nhận câu hỏi qua giao diện mô phỏng lệnh `/ask`;
- semantic retrieval bằng embedding, kết hợp lexical score;
- lấy top 5 thread từ corpus được phép;
- AI quyết định một trong bốn trạng thái;
- validate source ID ở backend;
- trả permalink message gốc;
- tạo ticket TA khi đúng phạm vi nhưng chưa đủ căn cứ;
- lưu trace retrieval và chạy golden-set eval.

### Không làm

- kết nối bot Discord, OAuth, phân quyền server và đồng bộ realtime;
- thu thập hoặc index DM/kênh không được phép;
- trả lời deadline, điểm số, khiếu nại, thời tiết;
- đưa đáp án bài kiểm tra đang mở;
- huấn luyện/fine-tune model riêng;
- bảo đảm câu trả lời cho chủ đề không tồn tại trong corpus;
- tự động nhắn TA thật trong CP3.

## 3. Flow

`/ask` → chuẩn hóa câu hỏi → embedding query → hybrid retrieval top 5 → AI kiểm tra căn cứ → backend validate nguồn → `resolved | clarify | escalated | out_of_scope`.

- `resolved`: có câu trả lời trực tiếp và ít nhất một source ID hợp lệ.
- `clarify`: chưa xác định được đối tượng/chủ đề; hỏi lại đúng một câu.
- `escalated`: câu hỏi thuộc phạm vi nhưng nguồn thiếu, mâu thuẫn hoặc cần code/dữ liệu cụ thể.
- `out_of_scope`: logistics, ngoài lề hoặc nội dung bị giới hạn.

## 4. Kiến trúc và ranh giới tin cậy

Corpus lưu thread, message ID, trạng thái đã giải quyết, vai trò tác giả và permalink. Query và thread được embedding bằng cùng model với task type phù hợp. Điểm cuối là `0.75 × semantic + 0.25 × lexical`.

LLM chỉ nhận top 5 nguồn. Output bị ép schema nhưng backend vẫn:

- loại source ID không thuộc top 5;
- chặn `resolved` nếu không có source hợp lệ;
- không dùng kiến thức nền để lấp nguồn;
- chuyển lỗi embedding/model sang `escalated`.

Vì vậy LLM là bộ đề xuất quyết định; backend mới là lớp thực thi quy tắc nguồn.

## 5. Dữ liệu

`data/discussions.json` là corpus mô phỏng CP3 gồm 26 thread, không phải dữ liệu Discord thật. Nó cố ý chứa:

- thread đã và chưa giải quyết;
- câu hỏi ngoài phạm vi;
- hard negative có từ giống nhau nhưng khác nghĩa;
- nguồn chính thức và nguồn thảo luận thường.

Golden set có 10 case diễn đạt lại từ chatlog VLearn đã ẩn danh. Chatlog chỉ dùng để tạo câu hỏi đánh giá, không được copy vào corpus làm đáp án, tránh leakage.

## 6. API contract

`POST /api/resolve`

```json
{
  "question": "Embedding khác TF-IDF thế nào?"
}
```

Response luôn có `status`, `understoodAs`, `sources` và `trace`. `trace` ghi mode demo/live, model, top thread, score, source ID đã chấp nhận/từ chối và latency.

## 7. CP3 quality bar

Golden set được khóa tại `eval/golden-set.json`. Một case pass khi routing đúng, retrieval chứa thread kỳ vọng, nguồn bắt buộc có mặt và source integrity hợp lệ.

Gate phát hành:

- pass rate tổng ≥ 80%;
- 0 false-resolved trên case phải hỏi lại, chuyển TA hoặc ngoài phạm vi;
- 0 trường hợp `resolved` thiếu nguồn hợp lệ;
- 0 source-integrity failure;
- report cuối phải có `observed_modes: ["live"]`;
- hai người review độc lập ít nhất 5 output resolved và đối chiếu claim với nguồn.

Report demo chỉ là baseline phần mềm, không chứng minh embedding/LLM thật.

## 8. Error analysis

Sau mỗi lần chạy, nhóm phân lỗi theo:

- retrieval miss;
- nhầm domain/hard negative;
- routing sai;
- thiếu hoặc bịa source;
- trả lời vượt quá căn cứ;
- lỗi provider/structured output.

Mỗi thay đổi prompt, trọng số retrieval hoặc corpus phải chạy lại cùng golden version. Nếu đổi expected output, tăng version và ghi lý do.

Baseline demo đầu tiên ngày 31/07/2026 đạt 21/26 case nhưng không đạt gate an toàn sau khi review: `A01`, `R04`, `R05`, `A03` bị false-resolved. Nguyên nhân là fallback lexical coi một vài từ chung như “prompt”, “model”, “ngữ cảnh” là đủ căn cứ. Hướng sửa là nhận diện input thiếu tham chiếu, chặn chủ đề chưa có trong corpus và giữ đường lui thay vì tổng hợp thread gần nhất.

Live eval ban đầu phát hiện hai lỗi vận hành: REST embedding đặt config sai tầng và parser Interaction chỉ tìm `output_text`. Sau khi sửa, `gemini-3.6-flash` chạm giới hạn 20 request free-tier; hệ thống được chuyển sang `gemini-3.1-flash-lite` và thêm retry/backoff cho HTTP 429/5xx. Lượt 25/26 còn một false-resolved với câu “Tóm tắt.”, nên backend bổ sung pre-check câu thiếu đối tượng trước retrieval. Golden set và expected output không đổi trong toàn bộ quá trình.

Report live phát hành `eval/runs/live-cp3-2026-07-31T02-40-14-849Z.json` đạt 26/26, `observed_modes: ["live"]`, 0 false-resolved, 0 resolved thiếu nguồn và 0 source-integrity failure.

## 9. Bằng chứng cần nộp

- ảnh/video bốn trạng thái UI;
- một trace live có semantic score;
- một case hard negative;
- một case thiếu căn cứ được chuyển TA;
- JSON report eval live đạt gate;
- link commit và hướng dẫn chạy trong README;
- bảng review định tính có tên hai người, 5 case, kết luận và bất đồng (nếu có).

## 10. Trạng thái hiện tại

- Corpus, hybrid retrieval, resolver schema, validator và UI bốn trạng thái: đã cài đặt.
- Lint, build và test tích hợp demo mode: đã chạy.
- Golden set 26 case, runner và error analysis: đã tạo.
- Eval live: đạt quality gate 26/26.
- Review định tính hai người: còn chờ thành viên thứ hai đối chiếu tối thiểu 5 output resolved.
- Discord integration thật: ngoài phạm vi CP3.
