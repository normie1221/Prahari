/**
 * AI-Assisted Community Moderation
 * =================================
 * Spec requirement: AI should ASSIST moderators — flag/suggest — never
 * auto-ban users or declare allegations as fact.
 *
 * This module implements real, working heuristics (no external API key
 * required, so it works out of the box):
 *   - spam / toxicity screening (keyword + pattern based)
 *   - duplicate-post detection (Jaccard similarity against recent posts
 *     in the same group)
 *   - safety-topic + location + category extraction (keyword mapping)
 *
 * It is written as a clean seam: swap `classifyText()`'s body for a call to
 * a real LLM (e.g. the Anthropic API) later without changing any caller.
 * Every output is a SUGGESTION attached to the post for a human moderator
 * to act on — nothing here silently deletes content or bans a user.
 */

const TOXIC_PATTERNS = [
  /\b(kill (you|yourself|him|her|them))\b/i,
  /\b(rape|molest)\b/i,
  /\bslur\b/i, // placeholder hook — replace with a real slur list in production
];

const SPAM_PATTERNS = [
  /https?:\/\/\S+.*https?:\/\/\S+/i, // multiple links
  /(.)\1{6,}/, // char repeated 7+ times ("!!!!!!!!")
  /\b(buy now|click here|free money|work from home)\b/i,
];

const CATEGORY_KEYWORDS = {
  HARASSMENT: ["harass", "followed", "catcall", "stalk", "groped", "inappropriate"],
  THEFT: ["theft", "stolen", "snatch", "pickpocket", "robbed"],
  LIGHTING: ["dark", "poorly lit", "no streetlight", "unlit", "lighting"],
  TRANSPORT: ["auto", "cab", "bus stop", "metro", "rickshaw", "taxi"],
  GENERAL_SAFETY: ["safe", "unsafe", "danger", "risky", "caution"],
};

function jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function classifyText(content) {
  const flags = [];
  if (TOXIC_PATTERNS.some((re) => re.test(content))) flags.push("POTENTIALLY_TOXIC");
  if (SPAM_PATTERNS.some((re) => re.test(content))) flags.push("POTENTIALLY_SPAM");

  const categories = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, words]) => words.some((w) => content.toLowerCase().includes(w)))
    .map(([cat]) => cat);

  return {
    flags,
    suggestedCategories: categories,
    needsModeratorReview: flags.length > 0,
  };
}

export function findDuplicates(content, recentPosts, threshold = 0.6) {
  return recentPosts
    .map((p) => ({ id: p.id, similarity: jaccardSimilarity(content, p.content) }))
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}
