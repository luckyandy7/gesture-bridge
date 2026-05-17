import type {
  BufferGeometry,
  Group,
  InstancedMesh,
  LineSegments,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Points,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three"
import type { GestureName, GestureSnapshot, NormalizedLandmark, Point } from "@/lib/interactive/types"

type ThreeModule = typeof import("three")

export type ThreeSceneId = "gesture_core" | "hand_rig" | "orbital_lab" | "depth_field"
export type ThreeQuality = "performance" | "balanced" | "cinematic"

export type ThreeSceneDefinition = {
  id: ThreeSceneId
  label: string
  description: string
  gestureFocus: string
  accent: string
}

export type ThreeRuntimeTelemetry = {
  calls: number
  triangles: number
  objects: number
}

export const THREE_SCENE_DEFINITIONS: ThreeSceneDefinition[] = [
  {
    id: "gesture_core",
    label: "제스처 코어",
    description: "손 포인터를 중심으로 회전하는 크리스탈 코어와 궤도 링입니다.",
    gestureFocus: "가리키기 · 집기",
    accent: "#8ee7d8",
  },
  {
    id: "hand_rig",
    label: "핸드 리그",
    description: "카메라 손 랜드마크를 3D 관절 구조로 재구성합니다.",
    gestureFocus: "손바닥 · 집기",
    accent: "#f7c96b",
  },
  {
    id: "orbital_lab",
    label: "오비탈 랩",
    description: "명령 노드와 위성 오브젝트가 손 방향에 맞춰 재배치됩니다.",
    gestureFocus: "양손 · 스와이프",
    accent: "#9db7ff",
  },
  {
    id: "depth_field",
    label: "깊이 필드",
    description: "포인터 주변의 공간 깊이를 막대와 파동으로 표시합니다.",
    gestureFocus: "이동 · 확대",
    accent: "#fb8f67",
  },
]

export const THREE_QUALITY_OPTIONS: Array<{ id: ThreeQuality; label: string }> = [
  { id: "performance", label: "경량" },
  { id: "balanced", label: "균형" },
  { id: "cinematic", label: "고품질" },
]

const QUALITY_SETTINGS: Record<ThreeQuality, { dpr: number; stars: number; shadows: boolean }> = {
  performance: { dpr: 1, stars: 90, shadows: false },
  balanced: { dpr: 1.35, stars: 150, shadows: false },
  cinematic: { dpr: 1.65, stars: 220, shadows: true },
}

const HAND_SEGMENTS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
] as const

const DEPTH_COLUMNS = 13
const DEPTH_ROWS = 7

export function getThreeSceneDefinition(id: ThreeSceneId) {
  return THREE_SCENE_DEFINITIONS.find((scene) => scene.id === id) ?? THREE_SCENE_DEFINITIONS[0]
}

export function getNextThreeScene(id: ThreeSceneId) {
  const index = THREE_SCENE_DEFINITIONS.findIndex((scene) => scene.id === id)
  return THREE_SCENE_DEFINITIONS[(index + 1 + THREE_SCENE_DEFINITIONS.length) % THREE_SCENE_DEFINITIONS.length].id
}

export class InteractiveThreeRuntime {
  private readonly THREE: ThreeModule
  private readonly container: HTMLDivElement
  private readonly renderer: WebGLRenderer
  private readonly scene: Scene
  private readonly camera: PerspectiveCamera
  private readonly world: Group
  private readonly subject: Group
  private readonly tempVector: Vector3
  private readonly tempScale: Vector3
  private readonly tempPosition: Vector3
  private readonly tempTarget: Vector3
  private readonly tempMatrix: import("three").Matrix4
  private readonly tempQuaternion: import("three").Quaternion

  private sceneId: ThreeSceneId
  private quality: ThreeQuality
  private coreMesh: Mesh | null = null
  private handJoints: InstancedMesh | null = null
  private handLines: LineSegments | null = null
  private depthBars: InstancedMesh | null = null
  private backgroundParticles: Points | null = null
  private rings: Object3D[] = []
  private orbiters: Object3D[] = []
  private pointerLight: import("three").PointLight

  constructor(THREE: ThreeModule, container: HTMLDivElement, sceneId: ThreeSceneId, quality: ThreeQuality) {
    this.THREE = THREE
    this.container = container
    this.sceneId = sceneId
    this.quality = quality
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x070b18, 0.035)
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80)
    this.camera.position.set(0, 0.6, 5.2)
    this.world = new THREE.Group()
    this.subject = new THREE.Group()
    this.tempVector = new THREE.Vector3()
    this.tempScale = new THREE.Vector3(1, 1, 1)
    this.tempPosition = new THREE.Vector3()
    this.tempTarget = new THREE.Vector3()
    this.tempMatrix = new THREE.Matrix4()
    this.tempQuaternion = new THREE.Quaternion()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.domElement.style.display = "block"
    this.renderer.domElement.style.height = "100%"
    this.renderer.domElement.style.width = "100%"
    this.container.appendChild(this.renderer.domElement)

    this.scene.add(this.world)
    this.world.add(this.subject)
    this.pointerLight = new THREE.PointLight(0xbbe9ff, 16, 8)
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0b1221, 1.9))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.72))
    this.scene.add(this.pointerLight)
    this.createEnvironment()
    this.applyQuality(quality)
    this.rebuildScene(sceneId)
    this.resize()
  }

  update(input: { snapshot: GestureSnapshot; scale: number; sceneId: ThreeSceneId; quality: ThreeQuality; visible: boolean; timestamp: number }) {
    if (input.quality !== this.quality) this.applyQuality(input.quality)
    if (input.sceneId !== this.sceneId) this.rebuildScene(input.sceneId)
    if (!input.visible) {
      this.renderer.clear()
      return
    }

    const time = input.timestamp * 0.001
    const pointer = input.snapshot.pointer
    const profile = gestureProfile(input.snapshot.activeGesture)
    const px = (pointer.x - 0.5) * 3.4
    const py = (0.5 - pointer.y) * 2.5

    this.tempTarget.set(px * 0.12, py * 0.1 + 0.04, 0)
    this.subject.position.lerp(this.tempTarget, 0.075)
    this.tempScale.setScalar(input.scale * profile.scale)
    this.subject.scale.lerp(this.tempScale, 0.08)
    this.subject.rotation.y += 0.006 * profile.speed + (pointer.x - 0.5) * 0.012
    this.subject.rotation.x += 0.004 * profile.speed + (pointer.y - 0.5) * 0.008

    this.camera.position.x += ((pointer.x - 0.5) * 0.85 - this.camera.position.x) * 0.035
    this.camera.position.y += (0.55 + (0.5 - pointer.y) * 0.34 - this.camera.position.y) * 0.035
    this.camera.lookAt(0, 0, 0)
    this.pointerLight.position.set(px, py, 2.4)
    this.pointerLight.intensity = 12 + profile.energy * 7

    this.updateCore(time, profile.energy)
    this.updateRings(time, profile)
    this.updateOrbiters(time, pointer, profile)
    this.updateHandRig(input.snapshot, time, profile)
    this.updateDepthBars(pointer, time, profile)
    if (this.backgroundParticles) {
      this.backgroundParticles.rotation.y = time * 0.035
      this.backgroundParticles.rotation.x = Math.sin(time * 0.2) * 0.04
    }

    this.renderer.render(this.scene, this.camera)
  }

  resize() {
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  telemetry(): ThreeRuntimeTelemetry {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      objects: this.scene.children.length + this.subject.children.length,
    }
  }

  dispose() {
    this.disposeObject(this.scene)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private applyQuality(quality: ThreeQuality) {
    this.quality = quality
    const settings = QUALITY_SETTINGS[quality]
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.dpr))
    this.renderer.shadowMap.enabled = settings.shadows
    this.rebuildBackgroundParticles(settings.stars)
  }

  private createEnvironment() {
    const THREE = this.THREE
    const grid = new THREE.GridHelper(9, 28, 0x72d8ff, 0x263850)
    grid.position.y = -1.45
    grid.material.transparent = true
    grid.material.opacity = 0.22
    this.world.add(grid)

    const horizon = new THREE.Mesh(
      new THREE.TorusGeometry(2.65, 0.006, 8, 128),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }),
    )
    horizon.rotation.x = Math.PI / 2
    horizon.position.y = -1.12
    this.world.add(horizon)
  }

  private rebuildBackgroundParticles(count: number) {
    if (this.backgroundParticles) {
      this.disposeObject(this.backgroundParticles)
      this.world.remove(this.backgroundParticles)
    }
    const THREE = this.THREE
    const positions = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      const radius = 3.2 + seeded(index, 0) * 4.8
      const theta = seeded(index, 1) * Math.PI * 2
      const y = -1 + seeded(index, 2) * 4.4
      positions[index * 3] = Math.cos(theta) * radius
      positions[index * 3 + 1] = y
      positions[index * 3 + 2] = Math.sin(theta) * radius - 2.3
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({ color: 0xaed7ff, size: 0.026, transparent: true, opacity: 0.48, depthWrite: false })
    this.backgroundParticles = new THREE.Points(geometry, material)
    this.world.add(this.backgroundParticles)
  }

  private rebuildScene(sceneId: ThreeSceneId) {
    this.sceneId = sceneId
    this.disposeSubject()
    if (sceneId === "hand_rig") this.buildHandRig()
    else if (sceneId === "orbital_lab") this.buildOrbitalLab()
    else if (sceneId === "depth_field") this.buildDepthField()
    else this.buildGestureCore()
  }

  private disposeSubject() {
    this.subject.children.forEach((child) => this.disposeObject(child))
    this.subject.clear()
    this.coreMesh = null
    this.handJoints = null
    this.handLines = null
    this.depthBars = null
    this.rings = []
    this.orbiters = []
  }

  private buildGestureCore() {
    const THREE = this.THREE
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.86, 3),
      new THREE.MeshStandardMaterial({
        color: 0x8ee7d8,
        emissive: 0x123d3a,
        emissiveIntensity: 0.8,
        roughness: 0.22,
        metalness: 0.64,
      }),
    )
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(core.geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }),
    )
    core.add(wire)
    this.coreMesh = core
    this.subject.add(core)

    for (let index = 0; index < 4; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.12 + index * 0.17, 0.006 + index * 0.002, 8, 144),
        new THREE.MeshBasicMaterial({ color: index % 2 ? 0x8fa8ff : 0x8ee7d8, transparent: true, opacity: 0.34 - index * 0.035 }),
      )
      ring.rotation.set(index * 0.55, index * 0.7, index * 0.32)
      this.rings.push(ring)
      this.subject.add(ring)
    }

    const nodeGeometry = new THREE.SphereGeometry(0.055, 12, 8)
    for (let index = 0; index < 12; index += 1) {
      const node = new THREE.Mesh(
        nodeGeometry,
        new THREE.MeshStandardMaterial({ color: index % 3 === 0 ? 0xffffff : 0x8ee7d8, emissive: 0x1b645e, emissiveIntensity: 0.75 }),
      )
      this.orbiters.push(node)
      this.subject.add(node)
    }
  }

  private buildHandRig() {
    const THREE = this.THREE
    const jointMaterial = new THREE.MeshStandardMaterial({ color: 0xf7c96b, emissive: 0x4c2707, emissiveIntensity: 0.88, roughness: 0.36 })
    this.handJoints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 12, 8), jointMaterial, 21)
    this.subject.add(this.handJoints)

    const positions = new Float32Array(HAND_SEGMENTS.length * 2 * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    this.handLines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffe2a6, transparent: true, opacity: 0.72 }))
    this.subject.add(this.handLines)

    const palm = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.012, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xf7c96b, transparent: true, opacity: 0.24 }),
    )
    palm.rotation.x = Math.PI / 2
    palm.position.z = -0.08
    this.rings.push(palm)
    this.subject.add(palm)
  }

  private buildOrbitalLab() {
    const THREE = this.THREE
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.62, 1),
      new THREE.MeshStandardMaterial({ color: 0x9db7ff, emissive: 0x18205c, emissiveIntensity: 0.92, metalness: 0.42, roughness: 0.28 }),
    )
    this.coreMesh = core
    this.subject.add(core)

    for (let index = 0; index < 5; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95 + index * 0.28, 0.005, 8, 128),
        new THREE.MeshBasicMaterial({ color: index % 2 ? 0x9db7ff : 0xffffff, transparent: true, opacity: 0.22 }),
      )
      ring.rotation.set(index * 0.42, Math.PI / 2 + index * 0.18, index * 0.37)
      this.rings.push(ring)
      this.subject.add(ring)
    }

    const satelliteGeometry = new THREE.OctahedronGeometry(0.09, 1)
    for (let index = 0; index < 16; index += 1) {
      const satellite = new THREE.Mesh(
        satelliteGeometry,
        new THREE.MeshStandardMaterial({ color: index % 4 === 0 ? 0xffffff : 0x9db7ff, emissive: 0x1c2a7a, emissiveIntensity: 0.7 }),
      )
      this.orbiters.push(satellite)
      this.subject.add(satellite)
    }
  }

  private buildDepthField() {
    const THREE = this.THREE
    const material = new THREE.MeshStandardMaterial({ color: 0xfb8f67, emissive: 0x4b170b, emissiveIntensity: 0.56, roughness: 0.5, metalness: 0.12 })
    this.depthBars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), material, DEPTH_COLUMNS * DEPTH_ROWS)
    this.subject.add(this.depthBars)

    const core = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.48, 0.06, 120, 12),
      new THREE.MeshStandardMaterial({ color: 0xffc0a8, emissive: 0x512010, emissiveIntensity: 0.78, roughness: 0.38, metalness: 0.24 }),
    )
    core.position.y = 0.28
    this.coreMesh = core
    this.subject.add(core)
  }

  private updateCore(time: number, energy: number) {
    if (!this.coreMesh) return
    this.coreMesh.rotation.x += 0.008 + energy * 0.004
    this.coreMesh.rotation.y += 0.011 + energy * 0.006
    const material = this.coreMesh.material
    if (!Array.isArray(material) && "emissiveIntensity" in material) {
      material.emissiveIntensity = 0.62 + energy * 0.48 + Math.sin(time * 2.4) * 0.08
    }
  }

  private updateRings(time: number, profile: ReturnType<typeof gestureProfile>) {
    this.rings.forEach((ring, index) => {
      ring.rotation.x += (0.002 + index * 0.0007) * profile.speed
      ring.rotation.y += (0.004 + index * 0.001) * profile.speed
      const pulse = 1 + Math.sin(time * 1.8 + index) * 0.025 + profile.energy * 0.025
      ring.scale.setScalar(pulse)
    })
  }

  private updateOrbiters(time: number, pointer: Point, profile: ReturnType<typeof gestureProfile>) {
    const pointerTilt = (pointer.x - 0.5) * 0.75
    this.orbiters.forEach((orbiter, index) => {
      const radius = 1.05 + (index % 5) * 0.23 + profile.energy * 0.16
      const angle = time * (0.52 + (index % 4) * 0.08) * profile.speed + (Math.PI * 2 * index) / Math.max(1, this.orbiters.length)
      const layer = (index % 3) - 1
      orbiter.position.set(Math.cos(angle) * radius, Math.sin(angle * 0.72 + pointerTilt) * 0.36 + layer * 0.2, Math.sin(angle) * radius * 0.58)
      orbiter.rotation.x += 0.02
      orbiter.rotation.y += 0.018
      orbiter.scale.setScalar(0.82 + Math.sin(time * 3 + index) * 0.08 + profile.energy * 0.18)
    })
  }

  private updateHandRig(snapshot: GestureSnapshot, time: number, profile: ReturnType<typeof gestureProfile>) {
    if (!this.handJoints || !this.handLines) return
    const points = snapshot.primaryHand?.landmarks.length ? snapshot.primaryHand.landmarks.map((point) => mapLandmark(point)) : fallbackHandPoints(snapshot.pointer, time, profile.energy)
    for (let index = 0; index < 21; index += 1) {
      const point = points[index] ?? points[0]
      const size = index === 8 ? 1.5 + profile.energy * 0.3 : 1 + profile.energy * 0.18
      this.tempPosition.set(point.x, point.y, point.z)
      this.tempScale.setScalar(0.9 * size)
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale)
      this.handJoints.setMatrixAt(index, this.tempMatrix)
    }
    this.handJoints.instanceMatrix.needsUpdate = true

    const attribute = this.handLines.geometry.getAttribute("position")
    HAND_SEGMENTS.forEach(([start, end], index) => {
      const left = points[start] ?? points[0]
      const right = points[end] ?? points[0]
      attribute.setXYZ(index * 2, left.x, left.y, left.z)
      attribute.setXYZ(index * 2 + 1, right.x, right.y, right.z)
    })
    attribute.needsUpdate = true
  }

  private updateDepthBars(pointer: Point, time: number, profile: ReturnType<typeof gestureProfile>) {
    if (!this.depthBars) return
    let index = 0
    const pointerX = (pointer.x - 0.5) * 4.2
    const pointerZ = (pointer.y - 0.5) * 3.1
    for (let row = 0; row < DEPTH_ROWS; row += 1) {
      for (let column = 0; column < DEPTH_COLUMNS; column += 1) {
        const x = (column - (DEPTH_COLUMNS - 1) / 2) * 0.32
        const z = (row - (DEPTH_ROWS - 1) / 2) * 0.32
        const distance = Math.hypot(x - pointerX * 0.32, z - pointerZ * 0.36)
        const height = 0.16 + Math.max(0, 1.25 - distance) * (0.42 + profile.energy * 0.32) + Math.sin(time * 2.2 + row * 0.7 + column * 0.36) * 0.04
        this.tempPosition.set(x, -0.96 + height * 0.5, z)
        this.tempScale.set(1, Math.max(0.08, height), 1)
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale)
        this.depthBars.setMatrixAt(index, this.tempMatrix)
        index += 1
      }
    }
    this.depthBars.instanceMatrix.needsUpdate = true
  }

  private disposeObject(object: Object3D) {
    object.traverse((child) => {
      const renderable = child as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] }
      renderable.geometry?.dispose()
      const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : []
      materials.forEach((material) => material.dispose())
    })
  }
}

function gestureProfile(gesture: GestureName) {
  if (gesture === "pinch") return { energy: 0.86, scale: 1.12, speed: 1.36 }
  if (gesture === "open_palm") return { energy: 0.74, scale: 1.06, speed: 1.16 }
  if (gesture === "fist") return { energy: 0.92, scale: 0.9, speed: 1.55 }
  if (gesture === "peace" || gesture === "cross") return { energy: 0.68, scale: 1.04, speed: 1.26 }
  if (gesture === "two_hands_spread") return { energy: 1, scale: 1.22, speed: 1.42 }
  if (gesture === "two_hands_together") return { energy: 0.78, scale: 0.84, speed: 1.08 }
  return { energy: 0.42, scale: 1, speed: 1 }
}

function mapLandmark(point: NormalizedLandmark) {
  return {
    x: (point.x - 0.5) * 3.35,
    y: (0.5 - point.y) * 2.55,
    z: -(point.z ?? 0) * 4.4,
  }
}

function fallbackHandPoints(pointer: Point, time: number, energy: number) {
  const baseX = (pointer.x - 0.5) * 2.25
  const baseY = (0.5 - pointer.y) * 1.72
  const spread = 0.2 + energy * 0.16 + Math.sin(time * 2.1) * 0.025
  const wrist = { x: baseX, y: baseY - 0.44, z: 0 }
  const points = [wrist]
  const fingerBases = [-0.36, -0.14, 0.08, 0.29, 0.48]
  fingerBases.forEach((offset, fingerIndex) => {
    for (let joint = 1; joint <= 4; joint += 1) {
      const curl = fingerIndex === 0 ? -0.12 : 0.04 * Math.sin(time + fingerIndex)
      points.push({
        x: baseX + offset * spread + (fingerIndex === 0 ? -joint * 0.04 : 0),
        y: baseY - 0.26 + joint * (0.19 - fingerIndex * 0.012),
        z: curl * joint + Math.sin(time * 1.6 + joint + fingerIndex) * 0.018,
      })
    }
  })
  return points.slice(0, 21)
}

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}
