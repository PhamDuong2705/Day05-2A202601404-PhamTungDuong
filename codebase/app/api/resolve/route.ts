type Source = {
  id: string;
  channel: string;
  author: string;
  time: string;
  excerpt: string;
  relevance: number;
};

const ragSources: Source[] = [
  {
    id: "m-1842",
    channel: "hỏi-bài-day-2",
    author: "Tuấn Kiệt",
    time: "Hôm qua lúc 20:14",
    excerpt:
      "RAG lấy kiến thức bên ngoài ở lúc truy vấn nên hợp khi tài liệu thay đổi thường xuyên. Fine-tuning chủ yếu điều chỉnh cách model phản hồi hoặc một hành vi chuyên biệt.",
    relevance: 96,
  },
  {
    id: "m-1795",
    channel: "tài-nguyên",
    author: "TA Hoàng",
    time: "Hôm qua lúc 16:32",
    excerpt:
      "Với chatbot hỏi đáp tài liệu, hãy thử retrieval và citation trước. Chỉ cân nhắc fine-tuning khi cần định dạng hoặc hành vi ổn định mà prompt chưa giải quyết được.",
    relevance: 93,
  },
  {
    id: "m-1611",
    channel: "hỏi-bài-day-2",
    author: "Ngọc Hà",
    time: "Thứ Ba lúc 21:08",
    excerpt:
      "Hai kỹ thuật không loại trừ nhau: có thể fine-tune cho cách trả lời, đồng thời dùng RAG để cung cấp kiến thức cập nhật và có nguồn.",
    relevance: 88,
  },
];

const temperatureSources: Source[] = [
  {
    id: "m-2014",
    channel: "hỏi-bài-day-1",
    author: "TA Phương",
    time: "Hôm qua lúc 22:05",
    excerpt:
      "Temperature thấp làm đầu ra ít ngẫu nhiên hơn, nhưng không biến kiến thức sai trong model thành đúng và cũng không cung cấp thêm nguồn.",
    relevance: 95,
  },
  {
    id: "m-1920",
    channel: "tài-nguyên",
    author: "Khánh Linh",
    time: "Hôm qua lúc 18:21",
    excerpt:
      "Muốn giảm hallucination cần grounding, giới hạn phạm vi và kiểm tra nguồn; không nên chỉ dựa vào temperature.",
    relevance: 91,
  },
];

function resolvedPayload(
  understoodAs: string,
  answer: string,
  sources: Source[],
  confidence: number,
) {
  return {
    status: "resolved",
    understoodAs,
    answer,
    confidence,
    foundCount: sources.length + 2,
    sources,
  };
}

export async function POST(request: Request) {
  const payload = (await request.json()) as { question?: string };
  const question = payload.question?.trim() ?? "";

  if (!question) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const normalized = question.toLocaleLowerCase("vi");

  if (/(rag|fine[\s-]?tun)/i.test(normalized)) {
    return Response.json(
      resolvedPayload(
        "So sánh RAG và fine-tuning cho chatbot hỏi đáp tài liệu",
        "Với chatbot hỏi đáp tài liệu, nên bắt đầu bằng RAG vì kiến thức có thể cập nhật, câu trả lời truy được về nguồn và không cần huấn luyện lại model. Fine-tuning phù hợp hơn khi cần điều chỉnh hành vi, giọng điệu hoặc định dạng phản hồi ổn định; nó không phải cách tốt để nhồi tài liệu thay đổi liên tục.",
        ragSources,
        0.91,
      ),
    );
  }

  if (/(temperature|hallucinat|bịa)/i.test(normalized)) {
    return Response.json(
      resolvedPayload(
        "Lý do model vẫn có thể hallucinate khi temperature thấp",
        "Temperature thấp chỉ làm quá trình chọn token ổn định hơn. Model vẫn có thể tạo thông tin sai nếu thiếu ngữ cảnh, kiến thức nền không đúng hoặc không được grounding vào nguồn. Để giảm hallucination cần retrieval, citation và đường lui khi không đủ căn cứ.",
        temperatureSources,
        0.86,
      ),
    );
  }

  return Response.json({
    status: "escalated",
    understoodAs: "Gỡ lỗi cụ thể cần thêm ngữ cảnh từ bài làm của học viên",
    answer: "",
    confidence: 0.42,
    foundCount: 2,
    sources: [],
    missing:
      "Các thảo luận tìm thấy chỉ nói chung về shape mismatch; chưa có tensor shape, đoạn code và stack trace để xác định nguyên nhân của trường hợp này.",
    taTicket: "TA-024",
  });
}
