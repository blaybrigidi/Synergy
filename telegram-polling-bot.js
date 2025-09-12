import dotenv from "dotenv";
dotenv.config();

import TelegramBot from "node-telegram-bot-api";
import { generateChatCompletion } from "./services/openaiService.js";
import { STAGES, getNextStage, getStageQuestions, buildMessagesForStage } from "./services/promptService.js";
import { postEvent, hashChatId } from "./services/analyticsService.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN missing. Set it in your .env file.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Minimal analytics mode: only emit session_started, stage_completed, ai_error, session_completed
const ANALYTICS_MINIMAL = String(process.env.ANALYTICS_MINIMAL || "true").toLowerCase() === "true";

// In-memory sessions: chatId -> session
const sessions = new Map();

function initSession(chatId) {
  const session = {
    chatId,
    stage: "intro",
    questionIndex: -1,
    name: null,
    location: null,
    introText: "",
    answers: { V: {}, A: {}, L: {}, U: {}, E: {} },
  };
  sessions.set(chatId, session);
  // analytics: session started
  postEvent("session_started", {
    sessionId: String(chatId),
    chatIdHash: hashChatId(chatId),
    stage: "intro",
    startedAt: new Date().toISOString(),
  });
  return session;
}

function getSession(chatId) {
  return sessions.get(chatId) || initSession(chatId);
}

function splitIntoChunks(text, maxLen = 2500) {
  if (!text || text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    // Prefer splitting on double-newline, then newline, then space
    let slice = remaining.slice(0, maxLen);
    let splitIdx = Math.max(
      slice.lastIndexOf("\n\n"),
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(" ")
    );
    if (splitIdx < maxLen * 0.6) {
      // fallback hard split to avoid tiny chunks
      splitIdx = maxLen;
    }
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

async function send(chatId, text, options = {}) {
  const msgs = splitIntoChunks(String(text || ""));
  let last;
  for (const part of msgs) {
    // Avoid sending empty chunks
    const content = part && part.length ? part : ".";
    last = await bot.sendMessage(chatId, content, { parse_mode: "Markdown", ...options });
  }
  return last;
}

function isYes(text) {
  return /^(y|yes|yeah|sure|ok|okay)\b/i.test(text.trim());
}

async function handleIntro(session, text) {
  // First interaction: ask for name + location
  if (session.questionIndex === -1) {
    session.questionIndex = 0;
    await send(session.chatId, "Hi, I’m Synergy AI by ACTIVATIONS. What’s your name and where are you chatting from? (e.g., ‘I’m Damilola from Kaduna, Nigeria’)\n\nReply in one message.");
    return;
  }

  // Capture intro line, try naive parse
  session.introText = text.trim();
  // naive extraction
  const nameMatch = text.match(/(?:i'm|i am|my name is)\s+([A-Za-z\-']+)/i);
  if (nameMatch) session.name = nameMatch[1];
  const fromMatch = text.match(/from\s+([^.,\n]+)/i);
  if (fromMatch) session.location = fromMatch[1].trim();

  await send(session.chatId,
    `Great to meet you${session.name ? `, ${session.name}` : ""}. I’ll guide you through five sessions using the VALUE framework to align your gifts with real opportunities.\n\nWhen you’re ready, reply with 'yes' to begin Session 1: Vision Mapping.`
  );
  // analytics: intro captured (always emit so name/location are recorded)
  postEvent("intro_captured", {
    sessionId: String(session.chatId),
    chatIdHash: hashChatId(session.chatId),
    name: session.name || null,
    location: session.location || null,
  });
  session.questionIndex = 1;
}

async function beginStage(session, stage) {
  session.stage = stage;
  session.questionIndex = 0;
  const questions = getStageQuestions(stage);
  // analytics: stage started (verbose only)
  if (!ANALYTICS_MINIMAL) {
    postEvent("stage_started", {
      sessionId: String(session.chatId),
      chatIdHash: hashChatId(session.chatId),
      stage,
    });
  }
  if (stage === "L") {
    await send(session.chatId, "SESSION 3: LEVERAGE\nAnswer the 3 parts together in ONE message.");
  } else if (stage === "V") {
    await send(session.chatId, "SESSION 1: VISION MAPPING\nAnswer honestly. No perfect answers needed.");
  } else if (stage === "A") {
    await send(session.chatId, "SESSION 2: AUDITING (Skills)");
  } else if (stage === "U") {
    await send(session.chatId, "SESSION 4: UPSKILL STRATEGICALLY");
  } else if (stage === "E") {
    await send(session.chatId, "SESSION 5: EXECUTE");
  }
  if (questions.length > 0) {
    await send(session.chatId, `Question: ${questions[0].text}`);
  }
}

async function handleStageAnswer(session, text) {
  const stage = session.stage;
  const questions = getStageQuestions(stage);
  const idx = session.questionIndex;

  if (!questions[idx]) {
    // unexpected; restart question
    session.questionIndex = 0;
  }

  const current = questions[session.questionIndex];
  session.answers[stage][current.key] = text.trim();
  // analytics: answer recorded (verbose only)
  if (!ANALYTICS_MINIMAL) {
    postEvent("answer_recorded", {
      sessionId: String(session.chatId),
      chatIdHash: hashChatId(session.chatId),
      stage,
      questionKey: current.key,
      text: text.trim(),
      questionIndex: session.questionIndex,
    });
  }

  const more = session.questionIndex < questions.length - 1;
  if (more) {
    session.questionIndex += 1;
    const nextQ = questions[session.questionIndex];
    await send(session.chatId, `Question: ${nextQ.text}`);
    return;
  }

  // Completed stage → call OpenAI
  await send(session.chatId, "Processing your answers… one moment.");
  try {
    const messages = buildMessagesForStage(session, stage);
    const result = await generateChatCompletion({ messages });
    const content = result.content || "(No content)";
    await send(session.chatId, content);
    // analytics: stage completed
    postEvent("stage_completed", {
      sessionId: String(session.chatId),
      chatIdHash: hashChatId(session.chatId),
      stage,
      aiContentLength: content.length,
    });
  } catch (err) {
    console.error("OpenAI error:", err?.message || err);
    await send(session.chatId, "I ran into an error generating your guidance. Please say 'retry' to try again, or continue.");
    session.pendingRetry = { stage };
    // analytics: ai error
    postEvent("ai_error", {
      sessionId: String(session.chatId),
      chatIdHash: hashChatId(session.chatId),
      stage,
      error: String(err?.message || err),
    });
    return;
  }

  // Advance to next stage
  const next = getNextStage(stage);
  if (next === "complete") {
    await send(session.chatId, "You’ve completed the full Synergy AI self-consultation. Take action on what you’ve learned. If you’d like a mentor or accountability, email Activationsthinktank@gmail.com. You are gifted. You are needed. The world is waiting.\n\nType 'restart' to begin again.");
    session.stage = "complete";
    session.questionIndex = -1;
    // analytics: session completed
    postEvent("session_completed", {
      sessionId: String(session.chatId),
      chatIdHash: hashChatId(session.chatId),
      completedAt: new Date().toISOString(),
      name: session.name || null,
      location: session.location || null,
    });
  } else {
    await beginStage(session, next);
  }
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const session = initSession(chatId);
  await send(chatId, "Welcome to Synergy AI – a self-consultation chatbot by the ACTIVATIONS team.");
  await handleIntro(session, "");
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text || text.startsWith("/start")) return;

  const session = getSession(chatId);

  // Commands
  if (/^restart$/i.test(text)) {
    initSession(chatId);
    await send(chatId, "Restarted. Let’s begin again.");
    await handleIntro(getSession(chatId), "");
    return;
  }

  if (session.stage === "intro") {
    if (session.questionIndex <= 0) {
      await handleIntro(session, text);
      return;
    }
    if (isYes(text)) {
      await beginStage(session, "V");
      return;
    }
    await send(chatId, "When you’re ready, reply 'yes' to begin Session 1: Vision Mapping.");
    return;
  }

  if (session.stage === "complete") {
    await send(chatId, "Type 'restart' to begin a new consultation.");
    return;
  }

  if (/^retry$/i.test(text) && session.pendingRetry?.stage === session.stage) {
    delete session.pendingRetry;
    await handleStageAnswer(session, session.answers[session.stage][getStageQuestions(session.stage)[session.questionIndex]?.key] || "");
    return;
  }

  await handleStageAnswer(session, text);
});

console.log("Synergy AI – Telegram bot (polling) running…");

