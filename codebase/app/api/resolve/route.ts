import { resolveQuestion } from "../../../lib/resolver";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { question?: string };
    const question = payload.question?.trim() ?? "";

    if (!question) {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    if (question.length > 1_000) {
      return Response.json(
        { error: "question must be 1000 characters or fewer" },
        { status: 400 },
      );
    }

    const result = await resolveQuestion(question);
    return Response.json(result);
  } catch {
    return Response.json(
      {
        error: "resolver request is invalid",
      },
      { status: 400 },
    );
  }
}
