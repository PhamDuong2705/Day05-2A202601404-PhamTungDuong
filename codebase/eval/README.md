# CP3 evaluation

Thư mục này biến tuyên bố “AI tìm đúng và không bịa nguồn” thành bằng chứng có thể chạy lại.

## Golden set

`golden-set.json` có 26 ca:

- 10 ca thường;
- ít nhất 2 ca cho từng lớp khó: đúng nguồn, mơ hồ, ngoài phạm vi và phân biệt miền;
- 6 ca hiếm hoặc thiếu căn cứ;
- 10 ca được diễn đạt lại từ chatlog VLearn đã ẩn danh, có `source_ref` để truy vết nhưng không chép câu trả lời tutor vào corpus.

Golden set được khóa trước khi chạy eval. Khi sửa kỳ vọng phải tăng `version` và ghi lý do trong commit.

## Quality gate

Một case chỉ pass khi:

1. HTTP thành công và trạng thái đúng;
2. nếu case có thread kỳ vọng, thread đó xuất hiện trong top 5 retrieval;
3. nếu đã giải quyết, message nguồn bắt buộc được trả về;
4. mọi source ID trả về đều được backend xác thực và không có ID bị từ chối.

CP3 chỉ đạt khi:

- tổng pass rate ≥ 80%;
- không có case đáng lẽ `clarify`, `escalated` hoặc `out_of_scope` nhưng lại trả `resolved`;
- không có câu trả lời `resolved` nào thiếu nguồn hợp lệ;
- không có lỗi toàn vẹn source.

Ba điều kiện an toàn là hard gate: điểm tổng cao vẫn fail nếu model trả lời khi phải từ chối/hỏi lại, bịa nguồn hoặc bỏ nguồn.

## Chạy

Khởi động app ở terminal thứ nhất:

```bash
npm run dev
```

Chạy eval ở terminal thứ hai:

```bash
npm run eval
```

Lưu baseline demo mà không làm command thất bại:

```bash
npm run eval:demo
```

Runner mặc định gọi `http://localhost:3000/api/resolve`. Có thể đổi:

```bash
node eval/run-eval.mjs --endpoint=http://127.0.0.1:3001/api/resolve --label=live-cp3
```

Mỗi lần chạy tạo JSON trong `eval/runs/`, gồm kết quả cả pass lẫn fail để phục vụ error analysis. Chỉ report có `observed_modes: ["live"]` mới là bằng chứng cho embedding và resolver thật.

## Review định tính

Runner tự động kiểm tra routing, retrieval và source integrity. Trước demo cuối, hai thành viên độc lập đọc tối thiểu 5 output `resolved`, đối chiếu từng claim với excerpt và message gốc. Ghi bất đồng cùng quyết định cuối vào `spec.md`; không thay expected output chỉ để nâng điểm.
