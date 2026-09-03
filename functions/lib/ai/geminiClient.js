"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGeminiModel = getGeminiModel;
const generative_ai_1 = require("@google/generative-ai");
function getGeminiModel() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not defined in runtime.");
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
        },
    });
}
//# sourceMappingURL=geminiClient.js.map