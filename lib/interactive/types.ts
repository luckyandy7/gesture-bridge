export type InteractiveMode =
  | "home"
  | "image"
  | "drawing"
  | "satoru"
  | "particles"
  | "weather"
  | "effects"
  | "game"
  | "three"
  | "music"
  | "settings"

export type GestureName =
  | "none"
  | "open_palm"
  | "fist"
  | "pinch"
  | "point"
  | "peace"
  | "cross"
  | "thumbs_up"
  | "thumbs_down"
  | "two_hands_together"
  | "two_hands_spread"
  | "swipe_left"
  | "swipe_right"

export type SwipeDirection = "left" | "right"

export type EffectId =
  | "red_energy"
  | "blue_pull"
  | "purple_fusion"
  | "fire_release"
  | "lightning_release"
  | "water_wave"
  | "wind_slash"
  | "shield"
  | "portal"
  | "particle_burst"
  | "aura"
  | "magic_circle"
  | "laser_beam"

export type MiniGameId =
  | "catch"
  | "bubble"
  | "pong"
  | "avoid"
  | "slice"
  | "throw"
  | "reaction"
  | "rhythm"
  | "target"

export type CommandIntent =
  | "unknown"
  | "set_mode"
  | "weather"
  | "image_show"
  | "image_next"
  | "image_prev"
  | "image_zoom_in"
  | "image_zoom_out"
  | "image_reset"
  | "image_hide"
  | "drawing_start"
  | "drawing_pen"
  | "drawing_eraser"
  | "drawing_color"
  | "drawing_thicker"
  | "drawing_thinner"
  | "drawing_clear"
  | "drawing_undo"
  | "drawing_save"
  | "effect_trigger"
  | "game_start"
  | "game_switch"
  | "three_show"
  | "three_hide"
  | "music_play"
  | "music_pause"
  | "music_next"
  | "music_prev"
  | "music_volume_up"
  | "music_volume_down"
  | "music_mute"
  | "reset_all"

export type Point = {
  x: number
  y: number
}

export type NormalizedLandmark = Point & {
  z?: number
}

export type TrackedHand = {
  id: string
  handedness: "Left" | "Right" | "Unknown"
  landmarks: NormalizedLandmark[]
  center: Point
  pointer: Point
  palmSize: number
  rotation: number
  pinchDistance: number
  pinchStrength: number
  gesture: GestureName
  fingers: {
    thumb: boolean
    index: boolean
    middle: boolean
    ring: boolean
    pinky: boolean
  }
}

export type GestureSnapshot = {
  hands: TrackedHand[]
  primaryHand: TrackedHand | null
  pointer: Point
  activeGesture: GestureName
  activeGestures: GestureName[]
  swipe: SwipeDirection | null
  twoHandDistance: number | null
  twoHandDelta: number
  comboProgress: string[]
  timestamp: number
}

export type GestureHistoryFrame = {
  timestamp: number
  x: number
  y: number
  gesture: GestureName
}

export type ParsedCommand = {
  intent: CommandIntent
  transcript: string
  mode?: InteractiveMode
  city?: string
  effectId?: EffectId
  miniGameId?: MiniGameId
  color?: string
  feedback: string
}

export type WeatherInfo = {
  city: string
  country?: string
  temperature: number
  feelsLike?: number
  humidity?: number
  windSpeed?: number
  weatherCode?: number
  condition: string
  isMock: boolean
  updatedAt: string
}

export type FloatingImagePanel = {
  id: number
  title: string
  src: string
  x: number
  y: number
  scale: number
  rotation: number
  visible: boolean
}

export type InteractionLog = {
  id: number
  text: string
  tone: "info" | "success" | "warning"
}
