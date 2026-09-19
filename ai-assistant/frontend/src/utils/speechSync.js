// ai-assistant/frontend/src/utils/speechSync.js

/**
 * Creates a weighted speech timeline for text-to-speech synchronization.
 * Punctuation marks are weighted with natural pauses (commas ~150ms, periods ~350ms, paragraphs ~500ms).
 */
export function createSpeechTimeline(text) {
  if (!text || typeof text !== 'string') {
    return { text: '', tokens: [], totalWeight: 0 };
  }

  // Tokenize words, whitespace, and punctuation
  const rawTokens = text.match(/\S+|\s+/g) || [text];
  const tokens = [];
  let totalWeight = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    let weight = tok.length;

    // Weight pauses at natural speech boundaries
    if (/[.!?]$/.test(tok)) {
      weight += 8; // Sentence end pause
    } else if (/[,;:]$/.test(tok)) {
      weight += 4; // Clause pause
    } else if (/\n/.test(tok)) {
      weight += 10; // Paragraph pause
    }

    tokens.push({
      text: tok,
      weight,
      cumulativeWeight: totalWeight + weight
    });
    totalWeight += weight;
  }

  return { text, tokens, totalWeight };
}

/**
 * Calculates the revealed and unspoken text based on playback progress (0.0 to 1.0).
 */
export function getSpeechSyncProgress(timeline, progress) {
  if (!timeline || !timeline.tokens || timeline.tokens.length === 0) {
    return { revealed: '', remaining: '' };
  }
  if (progress <= 0) {
    return { revealed: '', remaining: timeline.text };
  }
  if (progress >= 1) {
    return { revealed: timeline.text, remaining: '' };
  }

  const targetWeight = progress * timeline.totalWeight;
  let splitIndex = 0;
  let charCount = 0;

  for (let i = 0; i < timeline.tokens.length; i++) {
    charCount += timeline.tokens[i].text.length;
    if (timeline.tokens[i].cumulativeWeight >= targetWeight) {
      splitIndex = charCount;
      break;
    }
  }

  if (splitIndex === 0) splitIndex = charCount;

  return {
    revealed: timeline.text.slice(0, splitIndex),
    remaining: timeline.text.slice(splitIndex)
  };
}
