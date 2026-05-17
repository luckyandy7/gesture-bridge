import { NextResponse } from "next/server"

export const runtime = "nodejs"

type RefineToken = {
  label?: string
  confidence?: number
  expression?: {
    label?: string
    tone?: string
    confidence?: number
  }
}

type RefineRequest = {
  tokens?: RefineToken[]
  expression?: {
    label?: string
    tone?: string
    confidence?: number
    scores?: Record<string, number>
  }
  localSentence?: string
  localScore?: number
  localSource?: string
}

type RefineResult = {
  sentence: string
  score: number
  source: string
  usedLlm: boolean
  model?: string
  note?: string
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sentence: {
      type: "string",
      description: "손동작 gloss 토큰과 얼굴 표정을 반영한 자연스러운 한국어 문장.",
    },
    score: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "토큰 confidence와 표정 일관성을 반영한 전체 신뢰도.",
    },
    note: {
      type: "string",
      description: "불확실성이나 표정 반영 방식에 대한 짧은 내부 메모.",
    },
  },
  required: ["sentence", "score", "note"],
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RefineRequest | null
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const local = normalizeLocalFallback(payload)
  const tokens = sanitizeTokens(payload.tokens)
  if (!tokens.length) {
    return NextResponse.json<RefineResult>({
      sentence: "-",
      score: 0,
      source: "empty",
      usedLlm: false,
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json<RefineResult>({
      ...local,
      source: `${local.source}:no-openai-key`,
      usedLlm: false,
      note: "OPENAI_API_KEY가 없어서 로컬 문장 보정 결과를 사용했습니다.",
    })
  }

  const model = process.env.OPENAI_SIGN_TEXT_MODEL ?? "gpt-5-mini"

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 700,
        reasoning: { effort: "minimal" },
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "너는 한국어 수화 gloss 토큰을 자연스러운 한국어 문장으로 정리하는 보조 모델이다. " +
                  "입력은 브라우저 KNN 분류기가 인식한 단어 순서, 단어별 confidence, 얼굴 표정 정보, 로컬 후보 문장이다. " +
                  "토큰에 없는 내용을 새로 만들지 말고, 질문/부정/강조/긍정 표정이 문장 부호나 어조에 영향을 줄 때만 반영한다. " +
                  "confidence가 낮으면 단정하지 말고 로컬 후보에 가깝게 보수적으로 출력한다.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  tokens,
                  expression: payload.expression ?? null,
                  localCandidate: {
                    sentence: local.sentence,
                    score: local.score,
                    source: local.source,
                  },
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "sign_sentence_refinement",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
    })

    if (!apiResponse.ok) {
      const message = await apiResponse.text().catch(() => "")
      console.error("OpenAI sign sentence refinement failed", apiResponse.status, message.slice(0, 400))
      return NextResponse.json<RefineResult>({
        ...local,
        source: `${local.source}:llm-error-${apiResponse.status}`,
        usedLlm: false,
        model,
        note: "OpenAI 응답 오류로 로컬 문장 보정 결과를 사용했습니다.",
      })
    }

    const data = await apiResponse.json()
    const parsed = parseOpenAiJson(data)
    if (!parsed?.sentence) {
      return NextResponse.json<RefineResult>({
        ...local,
        source: `${local.source}:llm-parse-fallback`,
        usedLlm: false,
        model,
        note: "OpenAI 응답을 해석하지 못해 로컬 문장 보정 결과를 사용했습니다.",
      })
    }

    return NextResponse.json<RefineResult>({
      sentence: normalizeSentence(parsed.sentence),
      score: clampNumber(parsed.score, 0, 1, local.score),
      source: "openai-responses",
      usedLlm: true,
      model,
      note: String(parsed.note ?? ""),
    })
  } catch (error) {
    console.error("Sign sentence refinement crashed", error)
    return NextResponse.json<RefineResult>({
      ...local,
      source: `${local.source}:llm-exception`,
      usedLlm: false,
      model,
      note: "문장 정리 중 예외가 발생해 로컬 문장 보정 결과를 사용했습니다.",
    })
  }
}

function sanitizeTokens(tokens: RefineRequest["tokens"]) {
  return (tokens ?? [])
    .map((token) => ({
      label: String(token.label ?? "").trim(),
      confidence: clampNumber(token.confidence, 0, 1, 0),
      expression: token.expression
        ? {
            label: String(token.expression.label ?? ""),
            tone: String(token.expression.tone ?? ""),
            confidence: clampNumber(token.expression.confidence, 0, 1, 0),
          }
        : null,
    }))
    .filter((token) => token.label)
    .slice(-20)
}

function normalizeLocalFallback(payload: RefineRequest): Omit<RefineResult, "usedLlm" | "model" | "note"> {
  return {
    sentence: normalizeSentence(payload.localSentence ?? fallbackSentence(payload.tokens)),
    score: clampNumber(payload.localScore, 0, 1, averageTokenConfidence(payload.tokens)),
    source: payload.localSource ?? "local-naturalizer",
  }
}

function fallbackSentence(tokens: RefineRequest["tokens"]) {
  const labels = (tokens ?? []).map((token) => String(token.label ?? "").trim()).filter(Boolean)
  if (!labels.length) return "-"
  const joined = labels.join(" ")
  return /[.!?。？！]$/.test(joined) ? joined : `${joined}.`
}

function normalizeSentence(value: string) {
  const sentence = String(value).trim().replace(/\s+/g, " ")
  if (!sentence) return "-"
  return /[.!?。？！]$/.test(sentence) ? sentence : `${sentence}.`
}

function averageTokenConfidence(tokens: RefineRequest["tokens"]) {
  const values = (tokens ?? []).map((token) => token.confidence).filter((value): value is number => typeof value === "number")
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, number))
}

function parseOpenAiJson(data: unknown): { sentence?: string; score?: number; note?: string } | null {
  if (!data || typeof data !== "object") return null
  const maybeOutputText = (data as { output_text?: unknown }).output_text
  if (typeof maybeOutputText === "string") return parseJsonObject(maybeOutputText)

  const output = (data as { output?: unknown }).output
  if (!Array.isArray(output)) return null
  for (const item of output) {
    const content = (item as { content?: unknown })?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      const text = (part as { text?: unknown })?.text
      if (typeof text === "string") {
        const parsed = parseJsonObject(text)
        if (parsed) return parsed
      }
    }
  }
  return null
}

function parseJsonObject(text: string) {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}
