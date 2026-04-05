import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY must be set");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateQuestions(
  category: string,
  difficulty: string,
  sources: { title: string; url: string; index: number }[],
  facts: string[]
): Promise<{ text: string; answer: number; source: string }[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const sourcesContext =
    sources.length > 0
      ? `\n\nVERIFIED SOURCES:\n${sources.map((s) => `[Source ${s.index}] ${s.title}: ${s.url}`).join("\n")}`
      : "";

  const factsContext =
    facts.length > 0
      ? `\n\nRESEARCH FACTS about "${category}":\n${facts.slice(0, 5).map((f) => f.slice(0, 500)).join("\n\n")}`
      : "";

  const prompt = `You are a trivia question generator for '90sure'. Generate exactly 10 trivia questions where the answer is ALWAYS a single integer number.

CRITICAL RULES:
1. Every question MUST be about "${category}" specifically
2. ${sources.length > 0 ? "Create questions from the VERIFIED SOURCES below." : "Create well-known, verifiable facts about this category."}
3. NEVER invent or fabricate information. Only use real, verifiable facts.
4. All answers must be integers that can be looked up and verified

Difficulty: ${difficulty}
${factsContext}
${sourcesContext}

Return ONLY valid JSON with a "questions" array of 10 objects:
- "text": the question string
- "answer": the integer answer (MUST be accurate and verifiable)
- "sourceIndex": ${sources.length > 0 ? "the source number (1-" + sources.length + ")" : "null"}
- "explanation": 1-2 sentence explanation (NO URLs)`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const parsed = JSON.parse(jsonMatch[1]!.trim());
  const rawQuestions = Array.isArray(parsed)
    ? parsed
    : parsed.questions || parsed.items || [];

  return rawQuestions.slice(0, 10).map((q: any) => {
    const sourceIdx = q.sourceIndex != null ? Number(q.sourceIndex) : null;
    const sourceInfo = sourceIdx
      ? sources.find((s) => s.index === sourceIdx)
      : null;
    const source = sourceInfo
      ? `${q.explanation || "See source for details."} ${sourceInfo.url}`
      : q.explanation || "No source available.";
    return { text: q.text, answer: q.answer, source };
  });
}
