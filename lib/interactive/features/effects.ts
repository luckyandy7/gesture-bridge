import type { EffectId, Point } from "@/lib/interactive/types"

export type EffectDefinition = {
  id: EffectId
  label: string
  description: string
  category: "폭발" | "장막" | "궤적" | "원형장" | "빔"
  motion: string
  colors: [string, string, string]
  gestureHint: string
  burstSize: number
}

export type EffectParticleKind =
  | "spark"
  | "ember"
  | "ring"
  | "beam"
  | "bolt"
  | "slash"
  | "wave"
  | "glyph"
  | "smoke"
  | "shard"
  | "orbit"

export type EffectParticle = {
  id: number
  effectId: EffectId
  kind: EffectParticleKind
  x: number
  y: number
  originX: number
  originY: number
  targetX?: number
  targetY?: number
  vx: number
  vy: number
  life: number
  maxLife: number
  radius: number
  baseRadius: number
  length: number
  width: number
  color: string
  spin: number
  angle: number
  seed: number
  alpha: number
  pull: number
}

export const EFFECT_PARTICLE_LIMIT = 320

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    id: "red_energy",
    label: "붉은 에너지",
    description: "중심 폭발, 외곽 충격파, 잔열 입자가 동시에 터집니다.",
    category: "폭발",
    motion: "방사형 폭발 + 잔열 낙하",
    colors: ["#ff2d55", "#ff7a1a", "#ffd166"],
    gestureHint: "손바닥 → 주먹 → 집기",
    burstSize: 94,
  },
  {
    id: "blue_pull",
    label: "푸른 인력",
    description: "외곽 입자가 손끝으로 빨려 들어오며 수축 파동을 만듭니다.",
    category: "원형장",
    motion: "중심 흡입 + 수축 링",
    colors: ["#38bdf8", "#2563eb", "#dbeafe"],
    gestureHint: "양손 모으기",
    burstSize: 86,
  },
  {
    id: "purple_fusion",
    label: "보랏빛 융합",
    description: "두 색 입자가 궤도를 돌다 중심에서 융합 플레어를 만듭니다.",
    category: "원형장",
    motion: "쌍궤도 회전 + 중심 발광",
    colors: ["#a855f7", "#ec4899", "#f0abfc"],
    gestureHint: "양손 거리 조절",
    burstSize: 96,
  },
  {
    id: "fire_release",
    label: "화염 방출",
    description: "손바닥 앞쪽으로 불꽃, 연기, 열기 파편이 밀려 나갑니다.",
    category: "폭발",
    motion: "전방 분출 + 연기 상승",
    colors: ["#ef4444", "#f97316", "#fde047"],
    gestureHint: "손바닥",
    burstSize: 112,
  },
  {
    id: "lightning_release",
    label: "번개 방출",
    description: "검지 방향으로 짧은 전기 가지와 잔광이 분기됩니다.",
    category: "빔",
    motion: "지그재그 전기 분기",
    colors: ["#67e8f9", "#fef08a", "#ffffff"],
    gestureHint: "가리키기",
    burstSize: 58,
  },
  {
    id: "water_wave",
    label: "물결 파동",
    description: "투명한 물결과 작은 비산 입자가 여러 겹으로 퍼집니다.",
    category: "원형장",
    motion: "다중 파동 확산",
    colors: ["#22d3ee", "#0ea5e9", "#cffafe"],
    gestureHint: "좌우 스와이프",
    burstSize: 76,
  },
  {
    id: "wind_slash",
    label: "바람 절단",
    description: "빠른 손 이동 방향으로 얇은 절단선과 공기 파편이 남습니다.",
    category: "궤적",
    motion: "대각선 절단 궤적",
    colors: ["#bbf7d0", "#34d399", "#ecfdf5"],
    gestureHint: "빠른 이동",
    burstSize: 68,
  },
  {
    id: "shield",
    label: "방어막",
    description: "손 앞에 겹겹의 육각 보호막과 얇은 반사광이 생깁니다.",
    category: "장막",
    motion: "고정 원형 방어장",
    colors: ["#60a5fa", "#c4b5fd", "#ffffff"],
    gestureHint: "두 손가락 → 손바닥 → 집기",
    burstSize: 82,
  },
  {
    id: "portal",
    label: "포탈",
    description: "회전하는 포탈 링과 안쪽으로 말려드는 입자 소용돌이입니다.",
    category: "원형장",
    motion: "회전 링 + 소용돌이",
    colors: ["#14b8a6", "#8b5cf6", "#f8fafc"],
    gestureHint: "양손 모으기 → 펼치기",
    burstSize: 118,
  },
  {
    id: "particle_burst",
    label: "입자 폭발",
    description: "짧고 선명한 스파크와 유리 조각처럼 튀는 파편입니다.",
    category: "폭발",
    motion: "고속 스파크 산개",
    colors: ["#f8fafc", "#38bdf8", "#f97316"],
    gestureHint: "주먹 열기",
    burstSize: 82,
  },
  {
    id: "aura",
    label: "오라",
    description: "손 주변에 호흡하듯 커지는 장막과 느린 입자 흐름을 만듭니다.",
    category: "장막",
    motion: "저속 호흡형 에너지장",
    colors: ["#22c55e", "#84cc16", "#f0fdf4"],
    gestureHint: "손바닥 유지",
    burstSize: 72,
  },
  {
    id: "magic_circle",
    label: "마법진",
    description: "손끝 아래 회전 원형 문양, 글리프, 중심 점광을 표시합니다.",
    category: "원형장",
    motion: "회전 글리프 + 고정 원",
    colors: ["#f0abfc", "#c084fc", "#ffffff"],
    gestureHint: "집기 유지",
    burstSize: 92,
  },
  {
    id: "laser_beam",
    label: "레이저 빔",
    description: "가리킨 방향으로 코어 빔과 잔광 파편을 발사합니다.",
    category: "빔",
    motion: "직선 관통 빔",
    colors: ["#f43f5e", "#fef2f2", "#fb7185"],
    gestureHint: "가리키기",
    burstSize: 52,
  },
]

export function getEffectDefinition(id: EffectId) {
  return EFFECT_DEFINITIONS.find((effect) => effect.id === id) ?? EFFECT_DEFINITIONS[0]
}

export function createEffectParticles(effectId: EffectId, x: number, y: number, now: number, amount?: number): EffectParticle[] {
  const effect = getEffectDefinition(effectId)
  const count = amount ?? effect.burstSize

  if (effectId === "red_energy") return createRadialBurst(effect, x, y, now, count, ["ring", "spark", "ember", "shard"])
  if (effectId === "blue_pull") return createPullField(effect, x, y, now, count)
  if (effectId === "purple_fusion") return createOrbitFusion(effect, x, y, now, count)
  if (effectId === "fire_release") return createFireRelease(effect, x, y, now, count)
  if (effectId === "lightning_release") return createLightning(effect, x, y, now, count)
  if (effectId === "water_wave") return createWaterWave(effect, x, y, now, count)
  if (effectId === "wind_slash") return createWindSlash(effect, x, y, now, count)
  if (effectId === "shield") return createShield(effect, x, y, now, count)
  if (effectId === "portal") return createPortal(effect, x, y, now, count)
  if (effectId === "aura") return createAura(effect, x, y, now, count)
  if (effectId === "magic_circle") return createMagicCircle(effect, x, y, now, count)
  if (effectId === "laser_beam") return createLaserBeam(effect, x, y, now, count)
  return createRadialBurst(effect, x, y, now, count, ["spark", "shard", "ring"])
}

export function stepEffectParticles(particles: EffectParticle[], pointer?: Point, rect?: DOMRect, frameScale = 1) {
  const pointerX = pointer && rect ? pointer.x * rect.width : null
  const pointerY = pointer && rect ? pointer.y * rect.height : null
  const scale = Math.min(Math.max(frameScale, 0.5), 2.4)
  let writeIndex = 0

  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index]
    let vx = particle.vx
    let vy = particle.vy
    let x = particle.x
    let y = particle.y
    const targetX = pointerX ?? particle.targetX
    const targetY = pointerY ?? particle.targetY

    if (particle.pull && targetX !== undefined && targetY !== undefined) {
      vx += (targetX - x) * particle.pull * scale
      vy += (targetY - y) * particle.pull * scale
    }

    if (particle.kind === "orbit" || particle.kind === "glyph") {
      const centerX = targetX ?? particle.originX
      const centerY = targetY ?? particle.originY
      const age = 1 - particle.life
      const radius = particle.baseRadius + Math.sin(age * Math.PI * 2 + particle.seed) * particle.radius * 0.2
      const angle = particle.angle + particle.spin * particle.maxLife * age
      x = centerX + Math.cos(angle) * radius
      y = centerY + Math.sin(angle) * radius
      vx *= Math.pow(0.82, scale)
      vy *= Math.pow(0.82, scale)
    } else {
      x += vx * scale
      y += vy * scale
    }

    if (particle.kind === "ember" || particle.kind === "smoke") {
      vy -= (particle.kind === "smoke" ? 0.012 : 0.035) * scale
      vx += Math.sin((1 - particle.life) * 9 + particle.seed) * 0.018 * scale
    }

    const friction = particle.kind === "beam" || particle.kind === "bolt" || particle.kind === "slash" ? 0.965 : 0.986
    particle.x = x
    particle.y = y
    particle.vx = vx * Math.pow(friction, scale)
    particle.vy = vy * Math.pow(friction, scale)
    particle.life -= scale / particle.maxLife
    particle.radius += particle.kind === "ring" || particle.kind === "wave" ? particle.baseRadius * 0.018 * scale : 0
    particle.spin += 0.006 * scale

    if (particle.life > 0) {
      particles[writeIndex] = particle
      writeIndex += 1
    }
  }

  particles.length = writeIndex
  if (particles.length > EFFECT_PARTICLE_LIMIT) particles.splice(0, particles.length - EFFECT_PARTICLE_LIMIT)
  return particles
}

export function drawEffectField(context: CanvasRenderingContext2D, rect: DOMRect, pointer: Point, activeEffect: EffectId, pinching: boolean) {
  const effect = getEffectDefinition(activeEffect)
  const x = pointer.x * rect.width
  const y = pointer.y * rect.height
  const time = performance.now() * 0.001
  const radius = pinching ? 82 : 54

  context.save()
  context.globalCompositeOperation = "lighter"
  const glow = context.createRadialGradient(x, y, 0, x, y, radius * 1.6)
  glow.addColorStop(0, hexToRgba(effect.colors[2], pinching ? 0.28 : 0.18))
  glow.addColorStop(0.48, hexToRgba(effect.colors[0], pinching ? 0.16 : 0.1))
  glow.addColorStop(1, "rgba(0,0,0,0)")
  context.fillStyle = glow
  context.beginPath()
  context.arc(x, y, radius * 1.6, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = hexToRgba(effect.colors[0], 0.42)
  context.lineWidth = 1.5
  for (let index = 0; index < 2; index += 1) {
    context.beginPath()
    context.arc(x, y, radius + index * 16 + Math.sin(time * 2 + index) * 4, time + index, Math.PI * 1.45 + time + index)
    context.stroke()
  }
  context.restore()
}

export function drawEffectParticles(context: CanvasRenderingContext2D, particles: EffectParticle[]) {
  const detailed = particles.length <= 180
  context.save()
  context.globalCompositeOperation = "lighter"
  for (const particle of particles) {
    drawParticle(context, particle, detailed)
  }
  context.restore()
}

function createRadialBurst(effect: EffectDefinition, x: number, y: number, now: number, amount: number, kinds: EffectParticleKind[]) {
  return Array.from({ length: amount }, (_, index) => {
    const kind = index < 4 && kinds.includes("ring") ? "ring" : kinds[index % kinds.length]
    const angle = (Math.PI * 2 * index) / amount + randomBetween(-0.22, 0.22)
    const speed = kind === "ring" ? 0 : randomBetween(1.3, 6.4)
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: kind === "ring" ? randomBetween(24, 44) : randomBetween(2.2, 7.8),
      baseRadius: kind === "ring" ? randomBetween(54, 92) : randomBetween(4, 16),
      maxLife: kind === "ring" ? randomBetween(46, 78) : randomBetween(38, 72),
      length: randomBetween(18, 58),
      width: randomBetween(1.5, 4.2),
    })
  })
}

function createPullField(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount
    const distance = randomBetween(120, 340)
    const kind: EffectParticleKind = index % 9 === 0 ? "wave" : index % 4 === 0 ? "orbit" : "spark"
    return particle(effect, now, index, kind, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, {
      originX: x,
      originY: y,
      targetX: x,
      targetY: y,
      angle,
      vx: -Math.cos(angle) * randomBetween(1.2, 2.8),
      vy: -Math.sin(angle) * randomBetween(1.2, 2.8),
      pull: kind === "spark" ? 0.006 : 0.002,
      radius: randomBetween(2, 7),
      baseRadius: distance * 0.35,
      maxLife: randomBetween(58, 96),
      length: randomBetween(12, 36),
    })
  })
}

function createOrbitFusion(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount
    const kind: EffectParticleKind = index % 14 === 0 ? "ring" : index % 3 === 0 ? "orbit" : "spark"
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * randomBetween(0.5, 2.8),
      vy: Math.sin(angle) * randomBetween(0.5, 2.8),
      radius: kind === "ring" ? randomBetween(32, 62) : randomBetween(2, 6),
      baseRadius: randomBetween(54, 180),
      maxLife: randomBetween(62, 112),
      spin: randomBetween(0.018, 0.04) * (index % 2 ? 1 : -1),
      length: randomBetween(16, 48),
    })
  })
}

function createFireRelease(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = -Math.PI / 2 + randomBetween(-0.92, 0.92)
    const kind: EffectParticleKind = index % 5 === 0 ? "smoke" : index % 7 === 0 ? "shard" : "ember"
    const speed = kind === "smoke" ? randomBetween(0.8, 2.2) : randomBetween(2.4, 7.2)
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + randomBetween(-1.2, 0.8),
      radius: kind === "smoke" ? randomBetween(8, 24) : randomBetween(2.4, 8.8),
      baseRadius: randomBetween(12, 34),
      maxLife: kind === "smoke" ? randomBetween(78, 130) : randomBetween(36, 82),
      length: randomBetween(18, 64),
      width: randomBetween(2, 7),
      alpha: kind === "smoke" ? 0.42 : 0.92,
    })
  })
}

function createLightning(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = randomBetween(-0.28, 0.28)
    const kind: EffectParticleKind = index % 3 === 0 ? "bolt" : "spark"
    const speed = randomBetween(5, 12)
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomBetween(2, 5),
      baseRadius: randomBetween(8, 22),
      maxLife: randomBetween(16, 34),
      length: kind === "bolt" ? randomBetween(120, 260) : randomBetween(22, 58),
      width: kind === "bolt" ? randomBetween(2.2, 5.5) : randomBetween(1.2, 2.6),
    })
  })
}

function createWaterWave(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount
    const kind: EffectParticleKind = index % 8 === 0 ? "wave" : "spark"
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * randomBetween(0.8, 3.3),
      vy: Math.sin(angle) * randomBetween(0.8, 3.3),
      radius: kind === "wave" ? randomBetween(28, 58) : randomBetween(2, 5),
      baseRadius: randomBetween(26, 74),
      maxLife: kind === "wave" ? randomBetween(70, 120) : randomBetween(46, 86),
      length: randomBetween(12, 36),
      alpha: kind === "wave" ? 0.58 : 0.86,
    })
  })
}

function createWindSlash(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = -0.58 + randomBetween(-0.18, 0.18)
    const kind: EffectParticleKind = index % 4 === 0 ? "slash" : "spark"
    const offset = randomBetween(-90, 90)
    return particle(effect, now, index, kind, x + offset * 0.35, y + offset, {
      angle,
      vx: Math.cos(angle) * randomBetween(3, 8),
      vy: Math.sin(angle) * randomBetween(3, 8),
      radius: randomBetween(2, 6),
      baseRadius: randomBetween(12, 28),
      maxLife: randomBetween(20, 48),
      length: kind === "slash" ? randomBetween(110, 230) : randomBetween(24, 62),
      width: kind === "slash" ? randomBetween(4, 9) : randomBetween(1.2, 2.4),
    })
  })
}

function createShield(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount
    const kind: EffectParticleKind = index % 5 === 0 ? "glyph" : index % 3 === 0 ? "ring" : "spark"
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * randomBetween(0.2, 1.4),
      vy: Math.sin(angle) * randomBetween(0.2, 1.4),
      radius: kind === "ring" ? randomBetween(54, 86) : randomBetween(2, 5),
      baseRadius: kind === "glyph" ? randomBetween(76, 118) : randomBetween(52, 96),
      maxLife: randomBetween(64, 116),
      spin: randomBetween(0.008, 0.025) * (index % 2 ? 1 : -1),
      length: randomBetween(12, 42),
      alpha: 0.78,
    })
  })
}

function createPortal(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount
    const kind: EffectParticleKind = index % 9 === 0 ? "ring" : index % 2 === 0 ? "orbit" : "spark"
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * randomBetween(0.6, 3.6),
      vy: Math.sin(angle) * randomBetween(0.6, 3.6),
      radius: kind === "ring" ? randomBetween(44, 78) : randomBetween(2, 7),
      baseRadius: randomBetween(64, 170),
      maxLife: randomBetween(72, 132),
      spin: randomBetween(0.026, 0.058),
      length: randomBetween(16, 54),
      pull: kind === "spark" ? 0.002 : 0,
      targetX: x,
      targetY: y,
    })
  })
}

function createAura(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount
    const kind: EffectParticleKind = index % 7 === 0 ? "ring" : index % 3 === 0 ? "smoke" : "orbit"
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * randomBetween(0.15, 1.1),
      vy: Math.sin(angle) * randomBetween(0.15, 1.1),
      radius: kind === "smoke" ? randomBetween(7, 18) : randomBetween(2, 6),
      baseRadius: randomBetween(48, 142),
      maxLife: randomBetween(90, 150),
      spin: randomBetween(0.006, 0.02) * (index % 2 ? 1 : -1),
      length: randomBetween(10, 34),
      alpha: 0.55,
    })
  })
}

function createMagicCircle(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / amount
    const kind: EffectParticleKind = index % 4 === 0 ? "glyph" : index % 7 === 0 ? "ring" : "spark"
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * randomBetween(0.1, 1.7),
      vy: Math.sin(angle) * randomBetween(0.1, 1.7),
      radius: kind === "ring" ? randomBetween(42, 78) : randomBetween(2, 5),
      baseRadius: randomBetween(38, 124),
      maxLife: randomBetween(70, 122),
      spin: randomBetween(0.012, 0.032) * (index % 2 ? 1 : -1),
      length: randomBetween(12, 38),
      alpha: 0.82,
    })
  })
}

function createLaserBeam(effect: EffectDefinition, x: number, y: number, now: number, amount: number) {
  return Array.from({ length: amount }, (_, index) => {
    const angle = randomBetween(-0.06, 0.06)
    const kind: EffectParticleKind = index % 4 === 0 ? "beam" : index % 3 === 0 ? "shard" : "spark"
    const speed = kind === "beam" ? randomBetween(8, 16) : randomBetween(3, 8)
    return particle(effect, now, index, kind, x, y, {
      angle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomBetween(2, 5),
      baseRadius: randomBetween(6, 18),
      maxLife: kind === "beam" ? randomBetween(18, 34) : randomBetween(28, 52),
      length: kind === "beam" ? randomBetween(180, 330) : randomBetween(24, 72),
      width: kind === "beam" ? randomBetween(4, 8) : randomBetween(1.3, 3),
    })
  })
}

function particle(
  effect: EffectDefinition,
  now: number,
  index: number,
  kind: EffectParticleKind,
  x: number,
  y: number,
  overrides: Partial<EffectParticle>,
): EffectParticle {
  const color = effect.colors[index % effect.colors.length]
  return {
    id: now + index,
    effectId: effect.id,
    kind,
    x,
    y,
    originX: overrides.originX ?? x,
    originY: overrides.originY ?? y,
    targetX: overrides.targetX,
    targetY: overrides.targetY,
    vx: overrides.vx ?? 0,
    vy: overrides.vy ?? 0,
    life: 1,
    maxLife: overrides.maxLife ?? randomBetween(42, 88),
    radius: overrides.radius ?? randomBetween(2, 8),
    baseRadius: overrides.baseRadius ?? randomBetween(12, 42),
    length: overrides.length ?? randomBetween(16, 64),
    width: overrides.width ?? randomBetween(1.5, 4),
    color: overrides.color ?? color,
    spin: overrides.spin ?? randomBetween(-0.025, 0.025),
    angle: overrides.angle ?? randomBetween(0, Math.PI * 2),
    seed: now * 0.013 + index * 7.917,
    alpha: overrides.alpha ?? 0.92,
    pull: overrides.pull ?? 0,
  }
}

function drawParticle(context: CanvasRenderingContext2D, particle: EffectParticle, detailed: boolean) {
  const alpha = clamp(particle.life * particle.alpha, 0, 1)
  const age = 1 - particle.life

  context.save()
  context.globalAlpha = alpha
  context.translate(particle.x, particle.y)
  context.rotate(particle.angle + particle.spin * particle.maxLife * age)
  context.shadowColor = particle.color
  context.shadowBlur = detailed ? (particle.kind === "smoke" ? 0 : 14) : particle.kind === "beam" || particle.kind === "bolt" || particle.kind === "slash" ? 7 : 0

  if (particle.kind === "ring" || particle.kind === "wave") {
    drawRing(context, particle, age)
  } else if (particle.kind === "beam") {
    drawBeam(context, particle)
  } else if (particle.kind === "bolt") {
    drawBolt(context, particle)
  } else if (particle.kind === "slash") {
    drawSlash(context, particle)
  } else if (particle.kind === "glyph") {
    drawGlyph(context, particle, age)
  } else if (particle.kind === "smoke") {
    drawSmoke(context, particle, detailed)
  } else if (particle.kind === "shard") {
    drawShard(context, particle)
  } else {
    drawSpark(context, particle, detailed)
  }

  context.restore()
}

function drawRing(context: CanvasRenderingContext2D, particle: EffectParticle, age: number) {
  context.strokeStyle = hexToRgba(particle.color, particle.kind === "wave" ? 0.48 : 0.74)
  context.lineWidth = particle.kind === "wave" ? 2.2 : 3.4
  context.beginPath()
  context.arc(0, 0, particle.radius + particle.baseRadius * age, 0, Math.PI * 2)
  context.stroke()
  if (particle.kind === "ring") {
    context.strokeStyle = "rgba(255,255,255,0.22)"
    context.lineWidth = 1
    context.beginPath()
    context.arc(0, 0, particle.radius * 0.55 + particle.baseRadius * age * 0.66, 0, Math.PI * 2)
    context.stroke()
  }
}

function drawBeam(context: CanvasRenderingContext2D, particle: EffectParticle) {
  const gradient = context.createLinearGradient(0, 0, particle.length, 0)
  gradient.addColorStop(0, "rgba(255,255,255,0.95)")
  gradient.addColorStop(0.18, particle.color)
  gradient.addColorStop(1, "rgba(255,255,255,0)")
  context.fillStyle = gradient
  roundRect(context, 0, -particle.width * 0.5, particle.length, particle.width, particle.width)
  context.fill()
}

function drawBolt(context: CanvasRenderingContext2D, particle: EffectParticle) {
  context.strokeStyle = "rgba(255,255,255,0.92)"
  context.lineWidth = particle.width
  context.beginPath()
  context.moveTo(0, 0)
  const segments = 6
  for (let index = 1; index <= segments; index += 1) {
    const x = (particle.length / segments) * index
    const y = seededWave(particle.seed + index) * 18
    context.lineTo(x, y)
  }
  context.stroke()
  context.strokeStyle = particle.color
  context.lineWidth = particle.width * 2.1
  context.globalAlpha *= 0.35
  context.stroke()
}

function drawSlash(context: CanvasRenderingContext2D, particle: EffectParticle) {
  const gradient = context.createLinearGradient(-particle.length * 0.5, 0, particle.length * 0.5, 0)
  gradient.addColorStop(0, "rgba(255,255,255,0)")
  gradient.addColorStop(0.5, particle.color)
  gradient.addColorStop(1, "rgba(255,255,255,0)")
  context.strokeStyle = gradient
  context.lineWidth = particle.width
  context.lineCap = "round"
  context.beginPath()
  context.moveTo(-particle.length * 0.5, -particle.radius)
  context.quadraticCurveTo(0, particle.radius * 0.9, particle.length * 0.5, particle.radius)
  context.stroke()
}

function drawGlyph(context: CanvasRenderingContext2D, particle: EffectParticle, age: number) {
  const radius = particle.baseRadius * (0.58 + age * 0.18)
  context.strokeStyle = particle.color
  context.lineWidth = 1.4
  context.beginPath()
  context.arc(0, 0, radius, particle.seed % Math.PI, Math.PI * 1.45 + (particle.seed % Math.PI))
  context.stroke()
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6
    context.beginPath()
    context.moveTo(Math.cos(angle) * (radius - 6), Math.sin(angle) * (radius - 6))
    context.lineTo(Math.cos(angle) * (radius + 8), Math.sin(angle) * (radius + 8))
    context.stroke()
  }
}

function drawSmoke(context: CanvasRenderingContext2D, particle: EffectParticle, detailed: boolean) {
  if (!detailed) {
    context.fillStyle = hexToRgba(particle.color, 0.2)
    context.beginPath()
    context.arc(0, 0, particle.radius, 0, Math.PI * 2)
    context.fill()
    return
  }
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, particle.radius)
  gradient.addColorStop(0, hexToRgba(particle.color, 0.32))
  gradient.addColorStop(1, "rgba(255,255,255,0)")
  context.fillStyle = gradient
  context.beginPath()
  context.arc(0, 0, particle.radius, 0, Math.PI * 2)
  context.fill()
}

function drawShard(context: CanvasRenderingContext2D, particle: EffectParticle) {
  context.fillStyle = particle.color
  context.beginPath()
  context.moveTo(0, -particle.radius * 1.35)
  context.lineTo(particle.radius * 0.72, 0)
  context.lineTo(0, particle.radius * 1.35)
  context.lineTo(-particle.radius * 0.72, 0)
  context.closePath()
  context.fill()
}

function drawSpark(context: CanvasRenderingContext2D, particle: EffectParticle, detailed: boolean) {
  if (!detailed) {
    context.fillStyle = particle.color
    context.beginPath()
    context.arc(0, 0, particle.radius, 0, Math.PI * 2)
    context.fill()
    return
  }
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, particle.radius * 1.6)
  gradient.addColorStop(0, "rgba(255,255,255,0.96)")
  gradient.addColorStop(0.36, particle.color)
  gradient.addColorStop(1, "rgba(255,255,255,0)")
  context.fillStyle = gradient
  context.beginPath()
  context.arc(0, 0, particle.radius, 0, Math.PI * 2)
  context.fill()
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
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

function seededWave(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return (value - Math.floor(value) - 0.5) * 2
}
