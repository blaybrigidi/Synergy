import "dotenv/config";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn("[openaiService] OPENAI_API_KEY missing. Set it in your .env file.");
}

const client = new OpenAI({ apiKey });

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateChatCompletion({ messages, model, temperature = 0.7, maxRetries = 3 }) {
  const chosenModel = model || process.env.MODEL || "gpt-4o-mini";

  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    try {
      const response = await client.chat.completions.create({
        model: chosenModel,
        temperature,
        messages,
      });
      const content = response?.choices?.[0]?.message?.content?.trim() || "";
      return { content, raw: response };
    } catch (err) {
      lastErr = err;
      const isRetryable = !!(err?.status === 429 || err?.status >= 500);
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const backoff = Math.min(2000 * Math.pow(2, attempt), 15000);
      await delay(backoff);
      attempt += 1;
    }
  }
  throw lastErr || new Error("OpenAI call failed");
}

export default { generateChatCompletion };

