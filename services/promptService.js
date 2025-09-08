const INTRO_SYSTEM = process.env.SYSTEM_PROMPT_INTRO ||
  "You are an intelligent, respectful consultant (top 1%), with behavioural psychology and therapy background. Engage warmly and guide into the consultation.";

export const STAGES = ["intro", "V", "A", "L", "U", "E", "complete"];

export function getNextStage(current) {
  const idx = STAGES.indexOf(current);
  return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : "complete";
}

export function getStageQuestions(stage) {
  switch (stage) {
    case "V":
      return [
        { key: "v_q1", text: "What kind of lifestyle do you dream of in 5–10 years?" },
        { key: "v_q2", text: "What kind of work would make you feel deeply fulfilled?" },
        { key: "v_q3", text: "Who do you want to help or serve with your life?" },
        { key: "v_q4", text: "Share a moment you felt most alive, inspired, or your true self." },
        { key: "v_q5", text: "Anything else that came to mind during this session?" },
      ];
    case "A":
      return [
        { key: "a_q1", text: "What are you currently studying or have studied?" },
        { key: "a_q2", text: "What technical (hard) skills have you gained?" },
        { key: "a_q3", text: "What things do you naturally do well?" },
        { key: "a_q4", text: "Share a story where you felt useful or impactful." },
      ];
    case "L":
      return [
        { key: "l_combo", text: "Answer together: 1) What environment do you thrive in? 2) What personality traits describe you best? 3) Who inspires you and why?" },
      ];
    case "U":
      return [
        { key: "u_q1", text: "What areas would you love to grow in?" },
        { key: "u_q2", text: "Do you have access to a laptop or smartphone with internet?" },
        { key: "u_q3", text: "How many hours per week can you invest in learning?" },
      ];
    case "E":
      return [
        { key: "e_q1", text: "What’s stopping you right now from acting on your goals?" },
        { key: "e_q2", text: "What’s one thing you’d do if fear didn’t exist?" },
      ];
    default:
      return [];
  }
}

function collectAnswers(session, stage) {
  const byStage = session.answers?.[stage] || {};
  return Object.entries(byStage)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
}

export function buildMessagesForStage(session, stage) {
  const name = session.name || "friend";
  const location = session.location || (session.introText || "");
  const vAnswers = collectAnswers(session, "V");
  const aAnswers = collectAnswers(session, "A");
  const lAnswers = collectAnswers(session, "L");
  const uAnswers = collectAnswers(session, "U");

  if (stage === "V") {
    const userBlob = collectAnswers(session, "V");
    return [
      { role: "system", content: INTRO_SYSTEM },
      { role: "user", content: `User: ${name} from ${location}.\n\nVision Mapping answers:\n${userBlob}\n\nInstructions:\n- Summarize their direction in 2 lines.\n- Reflect emotions you infer from their words.\n- Provide one short quote or affirmation.\n- Suggest the best 3 sectors they can thrive in, with 1-sentence justification each.` },
    ];
  }

  if (stage === "A") {
    const userBlob = collectAnswers(session, "A");
    return [
      { role: "system", content: INTRO_SYSTEM },
      { role: "user", content: `User: ${name} from ${location}.\n\nVision context (raw answers):\n${vAnswers}\n\nAuditing answers:\n${userBlob}\n\nInstructions:\n- Identify soft and hard skills.\n- Suggest 3 major Nigeria/global problems their skills could help solve.\n- Score alignment to their vision 0–100% with a brief rationale.\n- Provide one encouragement line.` },
    ];
  }

  if (stage === "L") {
    const userBlob = collectAnswers(session, "L");
    return [
      { role: "system", content: INTRO_SYSTEM },
      { role: "user", content: `User: ${name} from ${location}.\n\nVision context:\n${vAnswers}\n\nAuditing context:\n${aAnswers}\n\nLeverage answers:\n${userBlob}\n\nInstructions:\n- Analyze traits and environment; list 2–3 leverage angles.\n- Recommend 1–2 industries where their edge matters most.\n- Cross-reference with industries implied in Vision/Auditing; state matches vs new.\n- Compute alignment % and give a gentle, authoritative verdict.` },
    ];
  }

  if (stage === "U") {
    const userBlob = collectAnswers(session, "U");
    return [
      { role: "system", content: INTRO_SYSTEM },
      { role: "user", content: `User: ${name} from ${location}.\n\nVision context:\n${vAnswers}\n\nAuditing context:\n${aAnswers}\n\nLeverage context:\n${lAnswers}\n\nUpskill answers:\n${userBlob}\n\nInstructions:\n- Suggest 3 high-ROI, fast-learnable skills tailored to their vision+skills+industries.\n- Match each to national demand in their location and global relevance.\n- Estimate earning potential tiers (e.g., entry, mid).\n- Prioritize by ease + income potential with a short plan for first steps.` },
    ];
  }

  if (stage === "E") {
    const userBlob = collectAnswers(session, "E");
    return [
      { role: "system", content: INTRO_SYSTEM },
      { role: "user", content: `User: ${name} from ${location}.\n\nVision context:\n${vAnswers}\n\nAuditing context:\n${aAnswers}\n\nLeverage context:\n${lAnswers}\n\nUpskill context:\n${uAnswers}\n\nExecute answers:\n${userBlob}\n\nInstructions:\n- Provide a 30–60–90 day roadmap with weekly milestones.\n- Include 2 online platforms where they can start offering value.\n- Suggest 1 monetization idea requiring minimal resources.\n- Keep tone confident, compassionate, and inspirational.` },
    ];
  }

  return [
    { role: "system", content: INTRO_SYSTEM },
    { role: "user", content: `Greet ${name} and continue the consultation.` },
  ];
}

export default { STAGES, getNextStage, getStageQuestions, buildMessagesForStage };

