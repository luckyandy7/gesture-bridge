import { NextResponse } from "next/server"
import {
  addSharedTrainingLabel,
  addSharedTrainingSample,
  clearSharedTraining,
  getSharedTrainingPayload,
} from "@/lib/sign-text/shared-training-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TrainingRequest = {
  action?: "add-label" | "add-sample"
  label?: string
  sequence?: unknown
}

export async function GET() {
  try {
    return jsonNoStore(await getSharedTrainingPayload())
  } catch (error) {
    return jsonNoStore({ error: errorMessage(error) }, 500)
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as TrainingRequest | null
  if (!payload?.action) {
    return jsonNoStore({ error: "학습 작업이 지정되지 않았습니다." }, 400)
  }

  try {
    if (payload.action === "add-label") {
      return jsonNoStore(await addSharedTrainingLabel(payload.label ?? ""))
    }
    if (payload.action === "add-sample") {
      return jsonNoStore(await addSharedTrainingSample(payload.label ?? "", payload.sequence))
    }
    return jsonNoStore({ error: "지원하지 않는 학습 작업입니다." }, 400)
  } catch (error) {
    return jsonNoStore({ error: errorMessage(error) }, 400)
  }
}

export async function DELETE() {
  try {
    return jsonNoStore(await clearSharedTraining())
  } catch (error) {
    return jsonNoStore({ error: errorMessage(error) }, 500)
  }
}

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "학습 데이터를 처리하지 못했습니다."
}
