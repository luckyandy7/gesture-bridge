"use client"

import type { FaceExpression } from "@/lib/sign-text/browser-model"

export type TokenRecord = {
  id: number
  label: string
  confidence: number
  timestamp: number
  expression: FaceExpression
}

export type TranslationCandidate = {
  sentence: string
  gloss: string
  score: number
  source: string
}

export type SentenceMemoryEntry = {
  gloss: string
  sentence: string
  count?: number
  source?: string
  tokens?: string[]
}

export type SentenceMemoryPayload = {
  entries?: SentenceMemoryEntry[]
}

const COMMON_SENTENCES: Record<string, string> = {
  "안녕하세요": "안녕하세요.",
  "감사합니다": "감사합니다.",
  "네": "네.",
  "아니요": "아니요.",
  "죄송합니다": "죄송합니다.",
  "도와주세요": "도와주세요.",
  "괜찮아요": "괜찮아요.",
}

export async function loadSentenceMemory(path = "/models/sign_sentence_memory.json") {
  const response = await fetch(path)
  if (!response.ok) return []
  const payload = (await response.json()) as SentenceMemoryPayload
  return payload.entries ?? []
}

export function translateTokens(tokens: string[], entries: SentenceMemoryEntry[], fuzzyThreshold = 0.56): TranslationCandidate {
  const normalizedTokens = tokens.map(normalizeToken).filter(Boolean)
  if (!normalizedTokens.length) {
    return { sentence: "-", gloss: "", score: 0, source: "empty" }
  }

  const gloss = normalizedTokens.join(" ")
  const exact = entries.find((entry) => normalizeGloss(entry.gloss) === gloss)
  if (exact) {
    return { sentence: normalizeKoreanSentence(exact.sentence), gloss: exact.gloss, score: 1, source: `exact:${exact.source ?? "memory"}` }
  }

  if (normalizedTokens.length === 1 && COMMON_SENTENCES[normalizedTokens[0]]) {
    const token = normalizedTokens[0]
    return { sentence: COMMON_SENTENCES[token], gloss: token, score: 0.98, source: "builtin" }
  }

  let bestEntry: SentenceMemoryEntry | null = null
  let bestScore = 0
  const querySet = new Set(normalizedTokens)
  const candidates = entries.filter((entry) => (entry.tokens ?? splitGloss(entry.gloss)).some((token) => querySet.has(normalizeToken(token))))
  const searchEntries = candidates.length ? candidates : entries

  for (const entry of searchEntries) {
    const score = scoreGlossMatch(normalizedTokens, entry.tokens ?? splitGloss(entry.gloss))
    if (score > bestScore) {
      bestScore = score
      bestEntry = entry
    }
  }

  if (bestEntry && bestScore >= fuzzyThreshold) {
    return {
      sentence: normalizeKoreanSentence(bestEntry.sentence),
      gloss: bestEntry.gloss,
      score: round(bestScore),
      source: `fuzzy:${bestEntry.source ?? "memory"}`,
    }
  }

  return { sentence: fallbackSentence(normalizedTokens), gloss, score: round(bestScore), source: "fallback" }
}

export function refineSentenceLikeLlm(tokens: TokenRecord[], candidate: TranslationCandidate, expression: FaceExpression) {
  const labels = tokens.map((token) => token.label)
  let sentence = candidate.sentence === "-" ? fallbackSentence(labels) : candidate.sentence
  const confidence = tokens.length ? tokens.reduce((sum, token) => sum + token.confidence, 0) / tokens.length : 0

  if (expression.tone === "question" && sentence.endsWith(".")) {
    sentence = `${sentence.slice(0, -1)}?`
  }

  if (expression.tone === "negative" && !labels.includes("아니요") && labels.length > 1) {
    sentence = sentence.replace(/\.$/, "")
    sentence = `${sentence}라는 뜻으로 보이지만, 부정 표정이 함께 감지됐어요.`
  }

  if (expression.tone === "positive" && labels.includes("감사합니다")) {
    sentence = "감사합니다."
  }

  if (labels.includes("네") && expression.tone === "emphasis") {
    sentence = "네, 알겠습니다."
  }

  return {
    sentence,
    source: candidate.source === "fallback" ? "local-naturalizer" : `${candidate.source}+expression`,
    score: round(clamp(candidate.score * 0.72 + confidence * 0.28, 0, 1)),
  }
}

export function isControlToken(label: string) {
  return ["끝", "완료", "문장끝", "문장_끝", "마침", "취소", "지우기", "초기화", "삭제", "되돌리기", "이전"].includes(normalizeToken(label))
}

function fallbackSentence(tokens: string[]) {
  const normalizedTokens = tokens.map(normalizeToken).filter(Boolean)
  if (!normalizedTokens.length) return "-"
  if (normalizedTokens.length === 1 && COMMON_SENTENCES[normalizedTokens[0]]) return COMMON_SENTENCES[normalizedTokens[0]]

  const joined = normalizedTokens.map((token) => token.replaceAll("_", " ")).join(" ")
  if (/[요다까죠]$/.test(joined)) return normalizeKoreanSentence(joined)
  return `${joined}${hasFinalConsonant(joined.at(-1) ?? "") ? "이라는" : "라는"} 의미로 인식했어요.`
}

function normalizeGloss(value: string) {
  return splitGloss(value).join(" ")
}

function splitGloss(value: string) {
  return value
    .replaceAll("\ufeff", " ")
    .replace(/[\/,;|]+/g, " ")
    .trim()
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean)
}

function normalizeToken(value: string) {
  return String(value).trim().replace(/\s+/g, "_").replace(/^_+|_+$/g, "")
}

function normalizeKoreanSentence(value: string) {
  const sentence = value.trim().replace(/\s+/g, " ")
  if (!sentence) return "-"
  return /[.!?。？！]$/.test(sentence) ? sentence : `${sentence}.`
}

function scoreGlossMatch(queryTokens: string[], candidateTokens: string[]) {
  if (!queryTokens.length || !candidateTokens.length) return 0
  const querySet = new Set(queryTokens)
  const candidateSet = new Set(candidateTokens.map(normalizeToken))
  const overlap = Array.from(querySet).filter((token) => candidateSet.has(token)).length
  const union = new Set([...querySet, ...candidateSet]).size
  const jaccard = union ? overlap / union : 0
  const orderedCandidateTokens = candidateTokens.map(normalizeToken).filter(Boolean)
  const ordered = longestCommonSubsequenceLength(queryTokens, orderedCandidateTokens) / Math.max(queryTokens.length, orderedCandidateTokens.length)
  const coverage = overlap / querySet.size
  const prefixBonus = candidateTokens.slice(0, queryTokens.length).map(normalizeToken).join(" ") === queryTokens.join(" ") ? 0.08 : 0
  const lengthGap = Math.abs(candidateSet.size - queryTokens.length) / Math.max(candidateSet.size, queryTokens.length)
  return Math.max(0, 0.44 * ordered + 0.34 * coverage + 0.22 * jaccard + prefixBonus - 0.12 * lengthGap)
}

function longestCommonSubsequenceLength(left: string[], right: string[]) {
  let previous = Array(right.length + 1).fill(0)
  left.forEach((leftToken) => {
    const current = [0]
    right.forEach((rightToken, index) => {
      current.push(leftToken === rightToken ? previous[index] + 1 : Math.max(previous[index + 1], current.at(-1) ?? 0))
    })
    previous = current
  })
  return previous.at(-1) ?? 0
}

function hasFinalConsonant(character: string) {
  const code = character.charCodeAt(0)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number) {
  return Math.round(value * 10000) / 10000
}
