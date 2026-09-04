import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AiUsage { tokenCount: number }

export function recordGeminiUsage(response: { response?: { usageMetadata?: { totalTokenCount?: number } } }, usage?: AiUsage): void {
  if (!usage) return;
  const tokenCount = response.response?.usageMetadata?.totalTokenCount;
  usage.tokenCount = typeof tokenCount === "number" && Number.isFinite(tokenCount) ? tokenCount : 0;
}

export function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined in runtime.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
}
