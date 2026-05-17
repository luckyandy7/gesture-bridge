import { getMiniGameDefinition } from "@/lib/interactive/features/mini-games"
import type { MiniGameId, Point } from "@/lib/interactive/types"

const FRAME_RATE = 60
const MAX_LIVES = 3
const TRAIL_LIMIT = 10

type MiniGameObjectKind =
  | "core"
  | "bonus"
  | "bubble"
  | "hazard"
  | "slice"
  | "decoy"
  | "target"
  | "ring"
  | "ball"
  | "throw"
  | "signal_wait"
  | "signal_go"

type MiniGameStatus = "playing" | "cleared" | "danger"

type MiniGameObject = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  kind: MiniGameObjectKind
  life: number
  color: string
  value: number
  phase?: number
}

export type MiniGameHudState = {
  id: MiniGameId
  score: number
  lives: number
  combo: number
  bestCombo: number
  round: number
  targetScore: number
  progress: number
  timeRemaining: number
  accuracy: number
  message: string
  status: MiniGameStatus
}

export type MiniGameRuntime = {
  id: MiniGameId
  score: number
  lives: number
  combo: number
  bestCombo: number
  round: number
  roundStartScore: number
  roundTargetScore: number
  hits: number
  attempts: number
  frame: number
  timer: number
  timeLimitFrames: number
  difficulty: number
  objects: MiniGameObject[]
  ball?: MiniGameObject
  target?: MiniGameObject
  message: string
  status: MiniGameStatus
  pointerTrail: Point[]
  lastSpawn: number
  lastPinch: boolean
  lastActionFrame: number
  nextObjectId: number
  shieldCooldown: number
  flash: number
  shake: number
}

export function createMiniGameRuntime(id: MiniGameId): MiniGameRuntime {
  const definition = getMiniGameDefinition(id)

  return {
    id,
    score: 0,
    lives: MAX_LIVES,
    combo: 0,
    bestCombo: 0,
    round: 1,
    roundStartScore: 0,
    roundTargetScore: definition.targetScore,
    hits: 0,
    attempts: 0,
    frame: 0,
    timer: 0,
    timeLimitFrames: definition.durationSeconds * FRAME_RATE,
    difficulty: 1,
    objects: [],
    message: definition.instruction,
    status: "playing",
    pointerTrail: [],
    lastSpawn: -999,
    lastPinch: false,
    lastActionFrame: -999,
    nextObjectId: 1,
    shieldCooldown: 0,
    flash: 0,
    shake: 0,
  }
}

export function stepMiniGame(game: MiniGameRuntime, rect: DOMRect, pointer: Point, pinching: boolean): MiniGameHudState {
  const px = pointer.x * rect.width
  const py = pointer.y * rect.height
  const justPinched = pinching && !game.lastPinch

  game.frame += 1
  game.timer += 1
  game.difficulty = 1 + Math.min(0.9, game.frame / (FRAME_RATE * 90)) + Math.min(0.55, game.round * 0.08)
  game.pointerTrail = [...game.pointerTrail.slice(-TRAIL_LIMIT + 1), { x: px, y: py }]
  game.flash *= 0.88
  game.shake *= 0.84
  game.shieldCooldown = Math.max(0, game.shieldCooldown - 1)
  game.status = game.lives <= 1 ? "danger" : "playing"

  if (game.timer >= game.timeLimitFrames) {
    finishTimedRound(game)
  }

  switch (game.id) {
    case "catch":
      stepCatchGame(game, rect, px, py)
      break
    case "bubble":
      stepBubbleGame(game, rect, px, py)
      break
    case "pong":
      stepPongGame(game, rect, py)
      break
    case "avoid":
      stepAvoidGame(game, rect, px, py, pinching)
      break
    case "slice":
      stepSliceGame(game, rect, px, py)
      break
    case "throw":
      stepThrowGame(game, rect, px, py, pinching)
      break
    case "reaction":
      stepReactionGame(game, rect, px, py)
      break
    case "rhythm":
      stepRhythmGame(game, rect, px, py, justPinched)
      break
    case "target":
      stepTargetGame(game, rect, px, py, justPinched)
      break
  }

  game.lastPinch = pinching
  game.objects = game.objects.filter((object) => object.life > 0 && object.y < rect.height + 120 && object.x > -140 && object.x < rect.width + 140)

  if (game.lives <= 0) {
    game.lives = MAX_LIVES
    game.combo = 0
    game.roundStartScore = Math.max(0, game.score - 10)
    game.score = Math.max(0, game.score - 10)
    game.objects = []
    game.ball = undefined
    game.target = undefined
    game.message = "기회를 모두 소진했습니다. 라운드를 재정렬합니다."
    game.status = "danger"
    game.shake = 1
  }

  if (game.score - game.roundStartScore >= game.roundTargetScore) {
    completeRound(game)
  }

  return getMiniGameHudState(game)
}

export function getMiniGameHudState(game: MiniGameRuntime): MiniGameHudState {
  return {
    id: game.id,
    score: game.score,
    lives: game.lives,
    combo: game.combo,
    bestCombo: game.bestCombo,
    round: game.round,
    targetScore: game.roundTargetScore,
    progress: clamp((game.score - game.roundStartScore) / game.roundTargetScore, 0, 1),
    timeRemaining: Math.max(0, Math.ceil((game.timeLimitFrames - game.timer) / FRAME_RATE)),
    accuracy: game.attempts > 0 ? Math.round((game.hits / game.attempts) * 100) : 100,
    message: game.message,
    status: game.status,
  }
}

export function drawMiniGame(context: CanvasRenderingContext2D, rect: DOMRect, game: MiniGameRuntime, pointer: Point) {
  const px = pointer.x * rect.width
  const py = pointer.y * rect.height
  const shakeX = (Math.random() - 0.5) * game.shake * 9
  const shakeY = (Math.random() - 0.5) * game.shake * 9

  context.clearRect(0, 0, rect.width, rect.height)
  context.save()
  context.translate(shakeX, shakeY)
  drawArena(context, rect, game)
  drawGameGuides(context, rect, game, px, py)
  drawPointerTrail(context, game.pointerTrail, getMiniGameDefinition(game.id).accent)

  for (const object of game.objects) {
    drawObject(context, object)
  }
  if (game.ball) drawObject(context, game.ball)
  if (game.target) drawObject(context, game.target)

  drawPointerReticle(context, px, py, game)
  context.restore()

  if (game.flash > 0.02) {
    context.save()
    context.globalAlpha = game.flash * 0.24
    context.fillStyle = getMiniGameDefinition(game.id).accent
    context.fillRect(0, 0, rect.width, rect.height)
    context.restore()
  }
}

function stepCatchGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number) {
  spawnEvery(game, Math.max(18, Math.round(42 / game.difficulty)), rect, () => {
    const roll = Math.random()
    const kind: MiniGameObjectKind = roll > 0.86 ? "hazard" : roll > 0.72 ? "bonus" : "core"
    return {
      ...baseObject(game, kind),
      x: randomBetween(48, rect.width - 48),
      y: -40,
      vx: randomBetween(-0.9, 0.9),
      vy: randomBetween(2.4, 4.2) * game.difficulty,
      r: kind === "bonus" ? 18 : kind === "hazard" ? 22 : 19,
      color: kind === "hazard" ? "#fb7185" : kind === "bonus" ? "#facc15" : "#38bdf8",
      value: kind === "bonus" ? 18 : 10,
    }
  })

  for (const object of game.objects) {
    object.x += object.vx
    object.y += object.vy
    object.phase = (object.phase ?? 0) + 0.05

    if (distancePoint(object, { x: px, y: py }) < object.r + 34) {
      object.life = 0
      if (object.kind === "hazard") {
        takeDamage(game, "붉은 코어와 충돌했습니다.")
      } else {
        award(game, object.value, object.kind === "bonus" ? "보너스 코어 획득" : "코어를 안정적으로 받았습니다.")
      }
    } else if (object.y > rect.height + 36 && object.kind !== "hazard") {
      object.life = 0
      takeDamage(game, "핵심 코어를 놓쳤습니다.")
    }
  }
}

function stepBubbleGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number) {
  spawnEvery(game, Math.max(16, Math.round(28 / game.difficulty)), rect, () => {
    const radius = randomBetween(18, 34)
    return {
      ...baseObject(game, "bubble"),
      x: randomBetween(42, rect.width - 42),
      y: rect.height + radius,
      vx: randomBetween(-1.3, 1.3),
      vy: randomBetween(-3.4, -1.9) * game.difficulty,
      r: radius,
      color: Math.random() > 0.78 ? "#a7f3d0" : "#67e8f9",
      value: radius < 24 ? 9 : 6,
    }
  })

  for (const object of game.objects) {
    object.x += object.vx + Math.sin((game.frame + object.id) * 0.025) * 0.45
    object.y += object.vy
    object.life -= 0.0015
    object.r *= 0.999
    if (distancePoint(object, { x: px, y: py }) < object.r + 21) {
      object.life = 0
      award(game, object.value, object.r < 24 ? "작은 버블 정밀 터치" : "버블을 터뜨렸습니다.")
    }
  }
}

function stepPongGame(game: MiniGameRuntime, rect: DOMRect, py: number) {
  const paddleX = rect.width - 34
  const paddleHalf = 78

  if (!game.ball) {
    game.ball = {
      ...baseObject(game, "ball"),
      x: rect.width * 0.48,
      y: rect.height * 0.5,
      vx: randomBetween(4.1, 5.2),
      vy: randomBetween(-3.3, 3.3),
      r: 14,
      color: "#60a5fa",
      value: 5,
    }
  }

  const ball = game.ball
  ball.x += ball.vx * game.difficulty
  ball.y += ball.vy * game.difficulty

  if (ball.y < ball.r + 24 || ball.y > rect.height - ball.r - 24) {
    ball.vy *= -1
  }
  if (ball.x < ball.r + 22) {
    ball.vx = Math.abs(ball.vx)
  }

  if (ball.x + ball.r >= paddleX && ball.x < rect.width + ball.r) {
    const offset = (ball.y - py) / paddleHalf
    if (Math.abs(offset) <= 1) {
      ball.x = paddleX - ball.r
      ball.vx = -Math.abs(ball.vx) - 0.18
      ball.vy += offset * 1.25
      award(game, 5, Math.abs(offset) < 0.25 ? "중앙 반사 성공" : "패들 반사 성공")
    } else if (ball.x > rect.width + 38) {
      game.ball = undefined
      takeDamage(game, "패들이 공을 놓쳤습니다.")
    }
  }
}

function stepAvoidGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number, pinching: boolean) {
  spawnEvery(game, Math.max(14, Math.round(34 / game.difficulty)), rect, () => {
    const fromLeft = Math.random() > 0.5
    return {
      ...baseObject(game, "hazard"),
      x: fromLeft ? -32 : rect.width + 32,
      y: randomBetween(76, rect.height - 76),
      vx: (fromLeft ? 1 : -1) * randomBetween(2.7, 5.4) * game.difficulty,
      vy: randomBetween(-1.4, 1.4),
      r: randomBetween(18, 31),
      color: "#fb7185",
      value: 4,
    }
  })

  if (game.frame % 42 === 0) {
    game.score += 1
    game.message = pinching ? "보호막 자세 유지 중" : "회피 생존 점수 +1"
  }

  for (const object of game.objects) {
    object.x += object.vx
    object.y += object.vy
    object.phase = (object.phase ?? 0) + 0.08
    if (distancePoint(object, { x: px, y: py }) < object.r + 25) {
      object.life = 0
      if (pinching && game.shieldCooldown === 0) {
        game.shieldCooldown = 90
        award(game, 7, "보호막으로 위험체를 상쇄했습니다.")
      } else {
        takeDamage(game, pinching ? "보호막 재충전 중 충돌했습니다." : "위험체와 충돌했습니다.")
      }
    }
  }
}

function stepSliceGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number) {
  spawnEvery(game, Math.max(18, Math.round(36 / game.difficulty)), rect, () => {
    const decoy = Math.random() > 0.82
    return {
      ...baseObject(game, decoy ? "decoy" : "slice"),
      x: randomBetween(56, rect.width - 56),
      y: rect.height + 38,
      vx: randomBetween(-1.6, 1.6),
      vy: randomBetween(-4.4, -2.5) * game.difficulty,
      r: decoy ? 21 : randomBetween(18, 28),
      color: decoy ? "#94a3b8" : "#facc15",
      value: decoy ? 0 : 11,
    }
  })

  const speed = getTrailSpeed(game.pointerTrail)
  for (const object of game.objects) {
    object.x += object.vx
    object.y += object.vy
    object.phase = (object.phase ?? 0) + 0.09
    if (speed > 26 && distancePoint(object, { x: px, y: py }) < object.r + 30) {
      object.life = 0
      if (object.kind === "decoy") {
        takeDamage(game, "회색 더미를 절단했습니다.")
      } else {
        award(game, object.value + Math.min(6, Math.floor(speed / 18)), "에너지 조각 절단")
      }
    } else if (object.y < -50 && object.kind === "slice") {
      object.life = 0
      miss(game, "절단 목표가 지나갔습니다.")
    }
  }
}

function stepThrowGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number, pinching: boolean) {
  if (!game.target) {
    game.target = {
      ...baseObject(game, "target"),
      x: rect.width * randomBetween(0.68, 0.84),
      y: rect.height * randomBetween(0.18, 0.42),
      vx: randomBetween(-0.9, 0.9),
      vy: randomBetween(-0.45, 0.45),
      r: 38,
      color: "#f97316",
      value: 18,
    }
  }

  game.target.x += game.target.vx
  game.target.y += game.target.vy
  if (game.target.x < rect.width * 0.58 || game.target.x > rect.width * 0.9) game.target.vx *= -1
  if (game.target.y < rect.height * 0.14 || game.target.y > rect.height * 0.52) game.target.vy *= -1

  if (!game.ball && !pinching) {
    game.message = "집기 제스처로 공을 잡은 뒤 손을 움직여 놓으세요."
    return
  }

  if (!game.ball) {
    game.ball = {
      ...baseObject(game, "throw"),
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      r: 17,
      color: "#fdba74",
      value: 0,
    }
  }

  const ball = game.ball
  if (pinching) {
    const velocity = getTrailVelocity(game.pointerTrail)
    ball.x = px
    ball.y = py
    ball.vx = velocity.x * 1.05
    ball.vy = velocity.y * 1.05
    game.message = "집은 채로 방향을 만들고 놓으면 투척합니다."
  } else {
    ball.x += ball.vx
    ball.y += ball.vy
    ball.vy += 0.2
    ball.vx *= 0.992

    if (distancePoint(ball, game.target) < ball.r + game.target.r) {
      const precision = clamp(1 - distancePoint(ball, game.target) / (ball.r + game.target.r), 0, 1)
      award(game, 12 + Math.round(precision * 12), precision > 0.58 ? "중앙 목표점 명중" : "목표 링 명중")
      game.ball = undefined
      game.target = undefined
    } else if (ball.y > rect.height + 100 || ball.x < -100 || ball.x > rect.width + 120) {
      game.ball = undefined
      miss(game, "투척 궤도가 목표를 벗어났습니다.")
    }
  }
}

function stepReactionGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number) {
  if (!game.target) {
    game.target = {
      ...baseObject(game, "signal_wait"),
      x: randomBetween(rect.width * 0.22, rect.width * 0.78),
      y: randomBetween(rect.height * 0.22, rect.height * 0.68),
      vx: 0,
      vy: 0,
      r: 36,
      color: "#f59e0b",
      value: game.frame + Math.round(randomBetween(55, 125)),
    }
    game.message = "주황 신호입니다. 초록으로 바뀔 때까지 기다리세요."
  }

  const target = game.target
  const touching = distancePoint(target, { x: px, y: py }) < target.r + 23

  if (target.kind === "signal_wait" && game.frame >= target.value) {
    target.kind = "signal_go"
    target.color = "#22c55e"
    target.value = game.frame + Math.round(randomBetween(52, 82))
    game.message = "지금 터치하세요."
  }

  if (target.kind === "signal_wait" && touching && game.frame - game.lastActionFrame > 36) {
    game.lastActionFrame = game.frame
    takeDamage(game, "너무 빨랐습니다. 초록 신호를 기다리세요.")
  }

  if (target.kind === "signal_go" && touching) {
    const remaining = Math.max(0, target.value - game.frame)
    award(game, 12 + Math.round(remaining / 6), "빠른 반응 성공")
    game.target = undefined
  } else if (target.kind === "signal_go" && game.frame > target.value) {
    game.target = undefined
    miss(game, "반응 시간이 지났습니다.")
  }
}

function stepRhythmGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number, justPinched: boolean) {
  if (game.frame % Math.max(50, Math.round(82 / game.difficulty)) === 0) {
    game.objects.push({
      ...baseObject(game, "ring"),
      x: rect.width * 0.5,
      y: rect.height * 0.5,
      vx: 0,
      vy: 0,
      r: 172,
      color: "#a855f7",
      value: 10,
    })
  }

  let judged = false
  for (const object of game.objects) {
    object.r -= 2.35 * game.difficulty
    object.phase = (object.phase ?? 0) + 0.04
    const inBeatWindow = object.r >= 42 && object.r <= 66 && distancePoint(object, { x: px, y: py }) < 118
    if (justPinched && inBeatWindow) {
      object.life = 0
      judged = true
      const precision = 1 - Math.abs(object.r - 54) / 16
      award(game, 10 + Math.max(0, Math.round(precision * 7)), precision > 0.72 ? "정박 입력" : "박자 입력 성공")
    }
    if (object.r < 22) {
      object.life = 0
      miss(game, "박자 입력을 놓쳤습니다.")
    }
  }

  if (justPinched && !judged && game.frame - game.lastActionFrame > 18) {
    game.lastActionFrame = game.frame
    miss(game, "판정선 밖 입력입니다.")
  }
}

function stepTargetGame(game: MiniGameRuntime, rect: DOMRect, px: number, py: number, justPinched: boolean) {
  if (game.objects.filter((object) => object.kind === "target").length < 3) {
    spawnEvery(game, Math.max(20, Math.round(45 / game.difficulty)), rect, () => {
      const decoy = Math.random() > 0.82
      return {
        ...baseObject(game, decoy ? "decoy" : "target"),
        x: randomBetween(72, rect.width - 72),
        y: randomBetween(92, rect.height - 92),
        vx: randomBetween(-1.6, 1.6) * game.difficulty,
        vy: randomBetween(-1.2, 1.2) * game.difficulty,
        r: decoy ? 26 : randomBetween(22, 34),
        color: decoy ? "#94a3b8" : "#f43f5e",
        value: decoy ? 0 : 12,
      }
    })
  }

  for (const object of game.objects) {
    object.x += object.vx
    object.y += object.vy
    object.phase = (object.phase ?? 0) + 0.06
    if (object.x < object.r + 24 || object.x > rect.width - object.r - 24) object.vx *= -1
    if (object.y < object.r + 70 || object.y > rect.height - object.r - 24) object.vy *= -1
  }

  if (justPinched) {
    const hit = game.objects
      .filter((object) => distancePoint(object, { x: px, y: py }) < object.r + 28)
      .sort((a, b) => distancePoint(a, { x: px, y: py }) - distancePoint(b, { x: px, y: py }))[0]

    if (!hit) {
      miss(game, "표적을 벗어났습니다.")
    } else if (hit.kind === "decoy") {
      hit.life = 0
      takeDamage(game, "회색 더미 표적을 맞혔습니다.")
    } else {
      hit.life = 0
      const precision = clamp(1 - distancePoint(hit, { x: px, y: py }) / (hit.r + 28), 0, 1)
      award(game, hit.value + Math.round(precision * 9), precision > 0.68 ? "정중앙 명중" : "표적 명중")
    }
  }
}

function drawArena(context: CanvasRenderingContext2D, rect: DOMRect, game: MiniGameRuntime) {
  const definition = getMiniGameDefinition(game.id)
  const gradient = context.createLinearGradient(0, 0, rect.width, rect.height)
  gradient.addColorStop(0, "rgba(2, 6, 23, 0.68)")
  gradient.addColorStop(0.52, "rgba(7, 12, 28, 0.44)")
  gradient.addColorStop(1, hexToRgba(definition.accent, 0.18))
  context.fillStyle = gradient
  context.fillRect(0, 0, rect.width, rect.height)

  context.save()
  context.strokeStyle = "rgba(255,255,255,0.07)"
  context.lineWidth = 1
  for (let x = 0; x <= rect.width; x += 56) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, rect.height)
    context.stroke()
  }
  for (let y = 0; y <= rect.height; y += 56) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(rect.width, y)
    context.stroke()
  }
  context.restore()
}

function drawGameGuides(context: CanvasRenderingContext2D, rect: DOMRect, game: MiniGameRuntime, px: number, py: number) {
  const accent = getMiniGameDefinition(game.id).accent
  context.save()
  context.strokeStyle = hexToRgba(accent, 0.54)
  context.fillStyle = hexToRgba(accent, 0.12)
  context.lineWidth = 2

  if (game.id === "pong") {
    context.setLineDash([8, 10])
    context.beginPath()
    context.moveTo(rect.width * 0.5, 38)
    context.lineTo(rect.width * 0.5, rect.height - 38)
    context.stroke()
    context.setLineDash([])
    roundRect(context, rect.width - 39, py - 82, 16, 164, 8)
    context.fill()
  }

  if (game.id === "throw" && game.target) {
    context.beginPath()
    context.arc(game.target.x, game.target.y, game.target.r + 18, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.arc(game.target.x, game.target.y, Math.max(8, game.target.r - 16), 0, Math.PI * 2)
    context.stroke()
  }

  if (game.id === "rhythm") {
    context.beginPath()
    context.arc(rect.width * 0.5, rect.height * 0.5, 54, 0, Math.PI * 2)
    context.stroke()
    context.fillStyle = "rgba(255,255,255,0.05)"
    context.beginPath()
    context.arc(rect.width * 0.5, rect.height * 0.5, 118, 0, Math.PI * 2)
    context.fill()
  }

  if (game.id === "avoid" && game.shieldCooldown === 0) {
    context.strokeStyle = "rgba(125, 211, 252, 0.7)"
    context.beginPath()
    context.arc(px, py, 54, 0, Math.PI * 2)
    context.stroke()
  }

  if (game.id === "target") {
    context.strokeStyle = "rgba(255,255,255,0.46)"
    context.beginPath()
    context.moveTo(px - 30, py)
    context.lineTo(px - 9, py)
    context.moveTo(px + 9, py)
    context.lineTo(px + 30, py)
    context.moveTo(px, py - 30)
    context.lineTo(px, py - 9)
    context.moveTo(px, py + 9)
    context.lineTo(px, py + 30)
    context.stroke()
  }

  context.restore()
}

function drawPointerTrail(context: CanvasRenderingContext2D, trail: Point[], accent: string) {
  if (trail.length < 2) return
  context.save()
  context.lineCap = "round"
  context.lineJoin = "round"
  for (let index = 1; index < trail.length; index += 1) {
    const previous = trail[index - 1]
    const current = trail[index]
    context.globalAlpha = index / trail.length
    context.strokeStyle = hexToRgba(accent, 0.66)
    context.lineWidth = 2 + index * 0.5
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(current.x, current.y)
    context.stroke()
  }
  context.restore()
}

function drawPointerReticle(context: CanvasRenderingContext2D, px: number, py: number, game: MiniGameRuntime) {
  const accent = getMiniGameDefinition(game.id).accent
  context.save()
  context.strokeStyle = game.lastPinch ? "rgba(255,255,255,0.86)" : hexToRgba(accent, 0.76)
  context.fillStyle = hexToRgba(accent, game.lastPinch ? 0.22 : 0.12)
  context.lineWidth = 2
  context.beginPath()
  context.arc(px, py, game.lastPinch ? 29 : 24, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.beginPath()
  context.arc(px, py, 4, 0, Math.PI * 2)
  context.fillStyle = "rgba(255,255,255,0.9)"
  context.fill()
  context.restore()
}

function drawObject(context: CanvasRenderingContext2D, object: MiniGameObject) {
  context.save()
  context.globalAlpha = clamp(object.life, 0, 1)
  context.translate(object.x, object.y)
  context.rotate((object.phase ?? 0) + object.id * 0.03)
  context.shadowColor = object.color
  context.shadowBlur = object.kind === "decoy" ? 4 : 20
  context.fillStyle = object.color
  context.strokeStyle = object.color
  context.lineWidth = 3

  if (object.kind === "hazard") {
    context.fillStyle = hexToRgba(object.color, 0.88)
    context.beginPath()
    for (let index = 0; index < 8; index += 1) {
      const radius = index % 2 === 0 ? object.r * 1.08 : object.r * 0.58
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 8
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath()
    context.fill()
  } else if (object.kind === "slice" || object.kind === "decoy") {
    context.fillStyle = hexToRgba(object.color, object.kind === "decoy" ? 0.42 : 0.82)
    context.beginPath()
    context.moveTo(0, -object.r * 1.22)
    context.lineTo(object.r * 0.92, 0)
    context.lineTo(0, object.r * 1.22)
    context.lineTo(-object.r * 0.92, 0)
    context.closePath()
    context.fill()
    context.strokeStyle = "rgba(255,255,255,0.42)"
    context.stroke()
  } else if (object.kind === "ring") {
    context.rotate(-(object.phase ?? 0) - object.id * 0.03)
    context.strokeStyle = hexToRgba(object.color, 0.82)
    context.lineWidth = 5
    context.beginPath()
    context.arc(0, 0, object.r, 0, Math.PI * 2)
    context.stroke()
    context.strokeStyle = "rgba(255,255,255,0.22)"
    context.lineWidth = 1
    context.beginPath()
    context.arc(0, 0, object.r - 16, 0, Math.PI * 2)
    context.stroke()
  } else if (object.kind === "target" || object.kind === "signal_go" || object.kind === "signal_wait") {
    context.rotate(-(object.phase ?? 0) - object.id * 0.03)
    context.fillStyle = hexToRgba(object.color, 0.18)
    context.beginPath()
    context.arc(0, 0, object.r, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.strokeStyle = "rgba(255,255,255,0.48)"
    context.lineWidth = 2
    context.beginPath()
    context.arc(0, 0, object.r * 0.52, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.moveTo(-object.r, 0)
    context.lineTo(object.r, 0)
    context.moveTo(0, -object.r)
    context.lineTo(0, object.r)
    context.stroke()
  } else {
    const gradient = context.createRadialGradient(-object.r * 0.35, -object.r * 0.35, 2, 0, 0, object.r * 1.24)
    gradient.addColorStop(0, "rgba(255,255,255,0.94)")
    gradient.addColorStop(0.35, hexToRgba(object.color, 0.82))
    gradient.addColorStop(1, hexToRgba(object.color, 0.18))
    context.fillStyle = gradient
    context.beginPath()
    context.arc(0, 0, object.r, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = hexToRgba(object.color, 0.85)
    context.stroke()
  }

  context.restore()
}

function spawnEvery(game: MiniGameRuntime, interval: number, rect: DOMRect, factory: () => MiniGameObject) {
  if (rect.width < 1 || rect.height < 1) return
  if (game.frame - game.lastSpawn < interval) return
  game.lastSpawn = game.frame
  game.objects.push(factory())
}

function baseObject(game: MiniGameRuntime, kind: MiniGameObjectKind): MiniGameObject {
  return {
    id: game.nextObjectId++,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 18,
    kind,
    life: 1,
    color: "#38bdf8",
    value: 0,
    phase: Math.random() * Math.PI * 2,
  }
}

function award(game: MiniGameRuntime, baseScore: number, message: string) {
  game.attempts += 1
  game.hits += 1
  game.combo += 1
  game.bestCombo = Math.max(game.bestCombo, game.combo)
  const comboBonus = Math.min(12, Math.floor(game.combo / 3) * 2)
  game.score += baseScore + comboBonus
  game.message = comboBonus > 0 ? `${message} · 콤보 보너스 +${comboBonus}` : message
  game.flash = 1
}

function miss(game: MiniGameRuntime, message: string) {
  game.attempts += 1
  game.combo = 0
  game.message = message
}

function takeDamage(game: MiniGameRuntime, message: string) {
  game.attempts += 1
  game.combo = 0
  game.lives -= 1
  game.message = message
  game.status = "danger"
  game.shake = 1
}

function completeRound(game: MiniGameRuntime) {
  const definition = getMiniGameDefinition(game.id)
  game.round += 1
  game.roundStartScore = game.score
  game.roundTargetScore = definition.targetScore + (game.round - 1) * 28
  game.timer = 0
  game.lives = Math.min(MAX_LIVES, game.lives + 1)
  game.status = "cleared"
  game.message = `라운드 ${game.round - 1} 목표 달성. 난이도가 상승합니다.`
  game.flash = 1
}

function finishTimedRound(game: MiniGameRuntime) {
  if (game.score - game.roundStartScore >= game.roundTargetScore * 0.72) {
    game.message = "시간 종료. 충분한 점수로 다음 라운드에 진입합니다."
    completeRound(game)
    return
  }

  takeDamage(game, "제한 시간 안에 목표 점수에 닿지 못했습니다.")
  game.timer = 0
  game.roundStartScore = game.score
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function getTrailSpeed(trail: Point[]) {
  if (trail.length < 2) return 0
  let speed = 0
  for (let index = 1; index < trail.length; index += 1) {
    speed += distancePoint(trail[index - 1], trail[index])
  }
  return speed / Math.max(1, trail.length - 1)
}

function getTrailVelocity(trail: Point[]) {
  if (trail.length < 2) return { x: 0, y: 0 }
  const first = trail[0]
  const last = trail[trail.length - 1]
  return { x: (last.x - first.x) / trail.length, y: (last.y - first.y) / trail.length }
}

function distancePoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "")
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
