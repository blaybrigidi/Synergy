import "dotenv/config";
import crypto from "crypto";

const webhookUrl = process.env.ANALYTICS_WEBHOOK_URL || "";

export function hashChatId(chatId) {
  try {
    return crypto.createHash("sha256").update(String(chatId)).digest("hex");
  } catch {
    return "";
  }
}

export async function postEvent(eventType, payload = {}) {
  if (!webhookUrl) return; // no-op if not configured
  try {
    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      ...payload,
    });
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      // Swallow errors but log basic info for debugging
      console.warn(`[analytics] Webhook non-OK: ${res.status}`);
    }
  } catch (err) {
    console.warn("[analytics] Webhook error:", err?.message || err);
  }
}

export default { postEvent, hashChatId };

