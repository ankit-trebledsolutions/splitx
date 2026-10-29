// Lightweight, on-device heuristic behind the "SPLIX SUGGEST" banner. It looks
// for phrasing that reads like a to-do and pulls out a task title. No model
// call — deliberately conservative so it stays quiet on ordinary chatter.
const TRIGGERS = [
  /\bdo ?n[o']?t forget (?:to |about )?/i,
  /\bdon't forget (?:to |about )?/i,
  /\bremember to /i,
  /\bwe (?:need|have) to /i,
  /\bsomeone (?:needs|has) to /i,
  /\bplease /i,
  /\bmake sure (?:to |you )?/i,
  /\bremind (?:me|us) to /i,
  /\b(?:can|could) (?:you|someone) /i,
  /\bwe should /i,
  /\blet'?s /i,
  /\bneed to /i,
];

// Verbs that make something actionable enough to offer as a task.
const ACTION_WORDS =
  /\b(book|buy|pay|call|confirm|reserve|order|collect|pack|check ?in|check ?out|send|bring|pick ?up|arrange|cancel|renew|apply|submit)\b/i;

const clean = (value) =>
  value
    .replace(/[.!?]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const titleCase = (value) => (value ? value[0].toUpperCase() + value.slice(1) : value);

/**
 * Returns { title } when the text reads like a task, otherwise null.
 */
export const detectTask = (rawText) => {
  const text = (rawText || '').trim();
  if (text.length < 8 || text.length > 300) return null;
  if (text.endsWith('?')) return null; // questions are not to-dos

  for (const trigger of TRIGGERS) {
    const match = trigger.exec(text);
    if (!match) continue;

    const remainder = clean(text.slice(match.index + match[0].length));
    if (remainder.length < 4) continue;
    if (!ACTION_WORDS.test(remainder)) continue;

    return { title: titleCase(remainder) };
  }

  return null;
};

export default detectTask;
