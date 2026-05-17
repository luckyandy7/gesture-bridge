"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Shader, ChromaFlow, Swirl } from "shaders/react"
import {
  Activity,
  Camera,
  ChevronRight,
  Copy,
  Keyboard,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Terminal,
} from "lucide-react"
import { CustomCursor } from "@/components/custom-cursor"
import { GrainOverlay } from "@/components/grain-overlay"
import { MagneticButton } from "@/components/magnetic-button"

type ModeKey = "pc-control" | "sign-text" | "interactive"

const navItems = ["선택", "PC 제어", "수화 텍스트", "인터랙티브", "실행 준비"]

const modes: Record<
  ModeKey,
  {
    title: string
    label: string
    description: string
    image: string
    brandIcon: string
    primaryCommand: string
    secondaryCommand: string
    facts: string[]
    steps: string[]
  }
> = {
  "pc-control": {
    title: "PC 제어",
    label: "손동작으로 화면 조작",
    description: "한 손의 정적인 제스처를 빠르게 판정해서 마우스 이동, 클릭, 스크롤, 슬라이드 넘기기로 연결합니다.",
    image: "/gesture-control-mode.png",
    brandIcon: "/brand/mode-pc-control-512.png",
    primaryCommand: "/pc-control",
    secondaryCommand: "PYTHONPATH=src python -m gesture_bridge pc-control --live",
    facts: ["웹 실행", "검지만 펴기: 커서 이동", "엄지+검지 붙이기: 클릭", "브이: 다음 슬라이드", "엄지 위/아래: 스크롤"],
    steps: ["브라우저에서 카메라 권한 허용", "MediaPipe Hands로 손 1개 추적", "Python과 같은 제스처 매핑 적용", "브라우저 내부 데스크톱 조작"],
  },
  "sign-text": {
    title: "수화 문장",
    label: "손과 얼굴 표정을 한국어 음성으로",
    description:
      "웹에서 손, 팔, 얼굴 표정을 함께 추적하고 gloss 토큰을 누적한 뒤, 문장 끝 신호에서 자연스러운 한국어 문장과 음성으로 출력합니다.",
    image: "/sign-text-mode.png",
    brandIcon: "/brand/mode-sign-sentence-512.png",
    primaryCommand: "/sign-text",
    secondaryCommand: "웹캠 권한 허용 후 수화 단어를 순서대로 입력",
    facts: ["웹 실행", "얼굴 표정 반영", "단어별 정확도", "문장 끝 신호", "보이스 출력"],
    steps: ["브라우저에서 손 + 얼굴 + 팔 포즈 추적", "30프레임 gloss 토큰 분류", "단어와 정확도를 하단 자막으로 누적", "문장 끝 신호에서 한국어 문장과 음성 출력"],
  },
  interactive: {
    title: "인터랙티브 체험",
    label: "한국어 음성과 손동작으로 조작",
    description:
      "웹캠 손 추적과 한국어 음성 명령으로 사진, 그림, 날씨, 시각 효과, 미니게임, 음악, 3D 오브젝트를 한 화면에서 제어합니다.",
    image: "/interactive-experience-mode.png",
    brandIcon: "/brand/mode-interactive-stage-512.png",
    primaryCommand: "/interactive",
    secondaryCommand: "음성 예시: “날씨 알려줘”, “그림 그리기 시작”, “게임 시작”",
    facts: ["사진 이동/확대", "공중 드로잉", "날씨 패널", "효과 콤보", "미니게임 9종", "3D·음악 제어"],
    steps: ["브라우저에서 카메라 권한 허용", "MediaPipe Hands로 손 포인터 추적", "한국어 음성 명령 파싱", "모드별 인터랙션 실행"],
  },
}

export default function Home() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollThrottleRef = useRef<number | null>(null)
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const shaderContainerRef = useRef<HTMLDivElement>(null)
  const [currentSection, setCurrentSection] = useState(0)
  const [selectedMode, setSelectedMode] = useState<ModeKey>("pc-control")
  const [isLoaded, setIsLoaded] = useState(true)
  const [copiedCommand, setCopiedCommand] = useState("")

  useEffect(() => {
    const checkShaderReady = () => {
      const canvas = shaderContainerRef.current?.querySelector("canvas")
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        setIsLoaded(true)
        return true
      }
      return false
    }

    if (checkShaderReady()) return

    const intervalId = window.setInterval(() => {
      if (checkShaderReady()) {
        window.clearInterval(intervalId)
      }
    }, 100)

    const fallbackTimer = window.setTimeout(() => {
      setIsLoaded(true)
    }, 1500)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(fallbackTimer)
    }
  }, [])

  const scrollToSection = (index: number) => {
    if (!scrollContainerRef.current) return

    const sectionWidth = scrollContainerRef.current.offsetWidth
    scrollContainerRef.current.scrollTo({
      left: sectionWidth * index,
      behavior: "smooth",
    })
    setCurrentSection(index)
  }

  const chooseMode = (mode: ModeKey) => {
    setSelectedMode(mode)
    const sectionByMode: Record<ModeKey, number> = {
      "pc-control": 1,
      "sign-text": 2,
      interactive: 3,
    }
    scrollToSection(sectionByMode[mode])
  }

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedCommand(command)
      window.setTimeout(() => setCopiedCommand(""), 1800)
    } catch {
      setCopiedCommand("")
    }
  }

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      touchStartY.current = event.touches[0].clientY
      touchStartX.current = event.touches[0].clientX
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (Math.abs(event.touches[0].clientY - touchStartY.current) > 10) {
        event.preventDefault()
      }
    }

    const handleTouchEnd = (event: TouchEvent) => {
      const touchEndY = event.changedTouches[0].clientY
      const touchEndX = event.changedTouches[0].clientX
      const deltaY = touchStartY.current - touchEndY
      const deltaX = touchStartX.current - touchEndX

      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50) {
        if (deltaY > 0 && currentSection < navItems.length - 1) {
          scrollToSection(currentSection + 1)
        } else if (deltaY < 0 && currentSection > 0) {
          scrollToSection(currentSection - 1)
        }
      }
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("touchstart", handleTouchStart, { passive: true })
      container.addEventListener("touchmove", handleTouchMove, { passive: false })
      container.addEventListener("touchend", handleTouchEnd, { passive: true })
    }

    return () => {
      if (container) {
        container.removeEventListener("touchstart", handleTouchStart)
        container.removeEventListener("touchmove", handleTouchMove)
        container.removeEventListener("touchend", handleTouchEnd)
      }
    }
  }, [currentSection])

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()

      if (!scrollContainerRef.current) return

      scrollContainerRef.current.scrollBy({
        left: event.deltaY,
        behavior: "auto",
      })

      const sectionWidth = scrollContainerRef.current.offsetWidth
      const newSection = Math.round(scrollContainerRef.current.scrollLeft / sectionWidth)
      if (newSection !== currentSection) {
        setCurrentSection(Math.max(0, Math.min(navItems.length - 1, newSection)))
      }
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false })
    }

    return () => {
      if (container) {
        container.removeEventListener("wheel", handleWheel)
      }
    }
  }, [currentSection])

  useEffect(() => {
    const handleScroll = () => {
      if (scrollThrottleRef.current) return

      scrollThrottleRef.current = requestAnimationFrame(() => {
        if (!scrollContainerRef.current) {
          scrollThrottleRef.current = null
          return
        }

        const sectionWidth = scrollContainerRef.current.offsetWidth
        const scrollLeft = scrollContainerRef.current.scrollLeft
        const newSection = Math.round(scrollLeft / sectionWidth)

        if (newSection !== currentSection && newSection >= 0 && newSection < navItems.length) {
          setCurrentSection(newSection)
        }

        scrollThrottleRef.current = null
      })
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true })
    }

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll)
      }
      if (scrollThrottleRef.current) {
        cancelAnimationFrame(scrollThrottleRef.current)
      }
    }
  }, [currentSection])

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <CustomCursor />
      <GrainOverlay />

      <div
        ref={shaderContainerRef}
        className={`fixed inset-0 z-0 transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        style={{ contain: "strict" }}
      >
        <Shader className="h-full w-full">
          <Swirl
            colorA="#1275d8"
            colorB="#e19136"
            speed={0.8}
            detail={0.8}
            blend={50}
            coarseX={40}
            coarseY={40}
            mediumX={40}
            mediumY={40}
            fineX={40}
            fineY={40}
          />
          <ChromaFlow
            baseColor="#0066ff"
            upColor="#0066ff"
            downColor="#d1d1d1"
            leftColor="#e19136"
            rightColor="#e19136"
            intensity={0.9}
            radius={1.8}
            momentum={25}
            maskType="alpha"
            opacity={0.97}
          />
        </Shader>
        <div
          className="absolute inset-0 opacity-85 mix-blend-screen"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 24%, rgba(18, 117, 216, 0.78), transparent 34%), radial-gradient(circle at 78% 38%, rgba(225, 145, 54, 0.72), transparent 32%), linear-gradient(120deg, rgba(0, 102, 255, 0.42), rgba(209, 209, 209, 0.18) 46%, rgba(225, 145, 54, 0.5))",
          }}
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <nav
        className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-5 py-5 transition-opacity duration-700 md:px-10 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={() => scrollToSection(0)}
          className="flex items-center gap-3 transition-transform hover:scale-[1.02]"
          aria-label="Gesture Bridge 홈으로 이동"
        >
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-foreground/10 bg-foreground/10 backdrop-blur-md">
            <Image
              src="/brand/gesture-bridge-mark-512.png"
              alt=""
              width={40}
              height={40}
              priority
              className="h-9 w-9 object-contain drop-shadow-[0_0_10px_rgba(225,145,54,0.34)]"
            />
          </div>
          <span className="font-sans text-lg font-semibold tracking-tight text-foreground md:text-xl">Gesture Bridge</span>
        </button>

        <div className="hidden items-center gap-7 md:flex">
          {navItems.map((item, index) => (
            <button
              key={item}
              onClick={() => scrollToSection(index)}
              className={`group relative font-sans text-sm font-medium transition-colors ${
                currentSection === index ? "text-foreground" : "text-foreground/72 hover:text-foreground"
              }`}
            >
              {item}
              <span
                className={`absolute -bottom-1 left-0 h-px bg-foreground transition-all duration-300 ${
                  currentSection === index ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </button>
          ))}
        </div>

        <MagneticButton
          variant="secondary"
          onClick={() => scrollToSection(selectedMode === "pc-control" ? 1 : selectedMode === "sign-text" ? 2 : 3)}
        >
          선택 보기
        </MagneticButton>
      </nav>

      <div
        ref={scrollContainerRef}
        data-scroll-container
        className={`relative z-10 flex h-screen overflow-x-auto overflow-y-hidden transition-opacity duration-700 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <section className="relative flex h-screen w-screen shrink-0 items-start overflow-y-auto px-5 pb-8 pt-24 md:items-end md:px-10 md:pb-14 lg:px-16">
          <div className="mx-auto grid w-full max-w-7xl gap-5 md:gap-7 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
            <div className="max-w-2xl">
              <h1 className="font-sans text-4xl font-light leading-[1.02] tracking-tight text-foreground md:text-7xl lg:text-8xl">
                Gesture
                <br />
                Bridge
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/86 md:mt-5 md:text-xl">
                같은 카메라 기반에서 출발하지만, 사용 목적은 명확히 분리했습니다. PC 제어, 수화 텍스트, 인터랙티브 체험 중 필요한 입구를 선택하세요.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 md:mt-7">
                <MagneticButton size="lg" variant="primary" onClick={() => chooseMode("pc-control")}>
                  PC 제어 선택
                </MagneticButton>
                <Link
                  href="/pc-control"
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-foreground/16 bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:scale-[1.02] hover:bg-foreground/90"
                >
                  <MousePointerClick className="h-4 w-4" />
                  PC 제어 실행
                </Link>
                <Link
                  href="/sign-text"
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-foreground/16 bg-foreground/5 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-xl transition hover:scale-[1.02] hover:bg-foreground/10"
                >
                  <Subtitles className="h-4 w-4" />
                  수화 텍스트 실행
                </Link>
                <Link
                  href="/interactive"
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-foreground/16 bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:scale-[1.02] hover:bg-foreground/90"
                >
                  <Sparkles className="h-4 w-4" />
                  인터랙티브 체험
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {(Object.keys(modes) as ModeKey[]).map((modeKey) => (
                <ModeChoiceCard
                  key={modeKey}
                  modeKey={modeKey}
                  selected={selectedMode === modeKey}
                  onSelect={() => chooseMode(modeKey)}
                />
              ))}
            </div>
          </div>
        </section>

        <ModeDetailSection
          modeKey="pc-control"
          copiedCommand={copiedCommand}
          copyCommand={copyCommand}
          scrollToSection={scrollToSection}
        />

        <ModeDetailSection
          modeKey="sign-text"
          copiedCommand={copiedCommand}
          copyCommand={copyCommand}
          scrollToSection={scrollToSection}
          reverse
        />

        <ModeDetailSection
          modeKey="interactive"
          copiedCommand={copiedCommand}
          copyCommand={copyCommand}
          scrollToSection={scrollToSection}
        />

        <section className="flex h-screen w-screen shrink-0 items-center px-5 pt-20 md:px-10 md:pt-0 lg:px-16">
          <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <h2 className="font-sans text-4xl font-light leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                실행 전
                <br />
                확인할 것
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-foreground/82 md:text-lg">
                웹 실행 모드는 브라우저에서 바로 열고, 실제 OS 전역 입력은 Python live 명령으로 분리해서 실행합니다.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SetupItem
                icon={Terminal}
                title="환경 활성화"
                text="프로젝트 루트에서 .venv를 활성화한 뒤 명령을 실행합니다."
                command="source .venv/bin/activate"
                copiedCommand={copiedCommand}
                copyCommand={copyCommand}
              />
              <SetupItem
                icon={Camera}
                title="카메라 점검"
                text="카메라 권한이나 인덱스가 애매하면 먼저 probe-camera로 확인합니다."
                command="PYTHONPATH=src python -m gesture_bridge probe-camera"
                copiedCommand={copiedCommand}
                copyCommand={copyCommand}
              />
              <SetupItem
                icon={ShieldCheck}
                title="안전 실행"
                text="PC 제어는 기본 드라이런으로 보고, 실제 입력은 --live를 붙일 때만 나갑니다."
              />
              <SetupItem
                icon={Activity}
                title="모델 상태"
                text="현재 수화 모델은 한국어 4개 라벨과 30프레임 시퀀스 기준으로 맞춰져 있습니다."
              />
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </main>
  )
}

function ModeChoiceCard({
  modeKey,
  selected,
  onSelect,
}: {
  modeKey: ModeKey
  selected: boolean
  onSelect: () => void
}) {
  const mode = modes[modeKey]

  return (
    <button
      onClick={onSelect}
      className={`group overflow-hidden rounded-lg border text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 ${
        selected
          ? "border-foreground/42 bg-foreground/16 shadow-2xl shadow-black/25"
          : "border-foreground/12 bg-foreground/7 hover:border-foreground/24 hover:bg-foreground/11"
      }`}
    >
      <div className="relative aspect-[2.35/1] overflow-hidden md:aspect-[16/10]">
        <Image
          src={mode.image}
          alt={`${mode.title} 모드 이미지`}
          fill
          priority={modeKey === "pc-control"}
          sizes="(max-width: 768px) 100vw, 42vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/62 via-black/10 to-transparent" />
        <div className="absolute bottom-4 left-4 grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-black/30 backdrop-blur-md">
          <Image
            src={mode.brandIcon}
            alt=""
            width={48}
            height={48}
            className="h-10 w-10 object-contain drop-shadow-[0_0_10px_rgba(225,145,54,0.42)]"
          />
        </div>
      </div>
      <div className="p-4 md:p-5">
        <div className="mb-0 flex items-center justify-between gap-4 md:mb-3">
          <div>
            <p className="font-mono text-xs text-foreground/56">{mode.label}</p>
            <h2 className="mt-1 font-sans text-2xl font-light tracking-tight text-foreground md:text-3xl">{mode.title}</h2>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-foreground/60 transition-transform group-hover:translate-x-1" />
        </div>
        <p className="hidden text-sm leading-relaxed text-foreground/78 md:block">{mode.description}</p>
      </div>
    </button>
  )
}

function ModeDetailSection({
  modeKey,
  copiedCommand,
  copyCommand,
  scrollToSection,
  reverse = false,
}: {
  modeKey: ModeKey
  copiedCommand: string
  copyCommand: (command: string) => void
  scrollToSection: (index: number) => void
  reverse?: boolean
}) {
  const mode = modes[modeKey]

  return (
    <section className="flex h-screen w-screen shrink-0 items-center px-5 pt-20 md:px-10 md:pt-0 lg:px-16">
      <div
        className={`mx-auto grid w-full max-w-7xl gap-7 lg:grid-cols-[1.04fr_0.96fr] lg:items-center ${
          reverse ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div className="relative min-w-0 overflow-hidden rounded-lg border border-foreground/12 bg-foreground/8 shadow-2xl shadow-black/20">
          <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_24%_24%,rgba(18,117,216,0.34),transparent_32%),radial-gradient(circle_at_78%_48%,rgba(225,145,54,0.28),transparent_30%),linear-gradient(135deg,rgba(6,8,18,0.94),rgba(4,10,24,0.98))]">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:54px_54px] opacity-30" />
            <div className="absolute left-8 top-8 h-20 w-20 rounded-full border border-white/12" />
            <div className="absolute right-12 top-12 h-28 w-44 rounded-lg border border-white/12 bg-white/6 backdrop-blur-md" />
            <div className="absolute bottom-20 right-24 h-px w-48 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)]" />
            <div className="absolute bottom-24 right-20 h-2 w-2 rounded-full bg-white/60 shadow-[0_0_28px_rgba(255,255,255,0.55)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/5 to-transparent" />
          </div>
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-white/68">{mode.label}</p>
              <h2 className="mt-1 font-sans text-3xl font-light tracking-tight text-white md:text-5xl">{mode.title}</h2>
            </div>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-white/14 bg-black/28 backdrop-blur-md">
              <Image
                src={mode.brandIcon}
                alt=""
                width={56}
                height={56}
                className="h-11 w-11 object-contain drop-shadow-[0_0_12px_rgba(225,145,54,0.44)]"
              />
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <h2 className="font-sans text-4xl font-light leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
            {mode.title}
            <br />
            모드
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground/84 md:text-lg">{mode.description}</p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {mode.steps.map((step, index) => (
              <div key={step} className="border-l border-foreground/24 pl-4">
                <p className="font-mono text-xs text-foreground/48">0{index + 1}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/86 md:text-base">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            {mode.facts.map((fact) => (
              <span key={fact} className="rounded-lg border border-foreground/12 bg-foreground/8 px-3 py-2 font-mono text-xs text-foreground/76">
                {fact}
              </span>
            ))}
          </div>

          {modeKey === "sign-text" ? (
            <div className="mt-7 rounded-lg border border-foreground/12 bg-black/24 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground/10">
                  <Subtitles className="h-5 w-5 text-foreground/78" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-xs text-foreground/52">웹 실행 경로</p>
                  <p className="mt-1 truncate text-sm text-foreground/86">/sign-text · 카메라에서 바로 수화 텍스트 실행</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-7 space-y-3">
              <CommandBlock
                label={modeKey === "pc-control" ? "웹 실행 경로" : "웹 체험 경로"}
                command={mode.primaryCommand}
                copied={copiedCommand === mode.primaryCommand}
                copyCommand={copyCommand}
              />
              <CommandBlock
                label={modeKey === "pc-control" ? "OS live 명령" : "한국어 명령"}
                command={mode.secondaryCommand}
                copied={copiedCommand === mode.secondaryCommand}
                copyCommand={copyCommand}
              />
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            {modeKey === "pc-control" ? (
              <Link
                href="/pc-control"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:scale-[1.02] hover:bg-foreground/90"
              >
                PC 제어 웹 실행
              </Link>
            ) : modeKey === "sign-text" ? (
              <Link
                href="/sign-text"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:scale-[1.02] hover:bg-foreground/90"
              >
                수화 텍스트 웹 실행
              </Link>
            ) : modeKey === "interactive" ? (
              <Link
                href="/interactive"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:scale-[1.02] hover:bg-foreground/90"
              >
                인터랙티브 스테이지 열기
              </Link>
            ) : (
              <MagneticButton variant="primary" onClick={() => copyCommand(mode.primaryCommand)}>
                실행 명령 복사
              </MagneticButton>
            )}
            <MagneticButton variant="secondary" onClick={() => scrollToSection(0)}>
              선택 화면
            </MagneticButton>
          </div>
        </div>
      </div>
    </section>
  )
}

function CommandBlock({
  label,
  command,
  copied,
  copyCommand,
}: {
  label: string
  command: string
  copied: boolean
  copyCommand: (command: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-foreground/12 bg-black/24 p-3 backdrop-blur-md">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground/10">
        <Keyboard className="h-4 w-4 text-foreground/78" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-foreground/52">{label}</p>
        <code className="block truncate font-mono text-xs text-foreground/86 md:text-sm">{command}</code>
      </div>
      <button
        onClick={() => copyCommand(command)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/78 transition hover:bg-foreground/14 hover:text-foreground"
        aria-label={`${label} 명령 복사`}
      >
        {copied ? <ShieldCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

function SetupItem({
  icon: Icon,
  title,
  text,
  command,
  copiedCommand,
  copyCommand,
}: {
  icon: typeof Terminal
  title: string
  text: string
  command?: string
  copiedCommand?: string
  copyCommand?: (command: string) => void
}) {
  return (
    <div className="rounded-lg border border-foreground/12 bg-foreground/8 p-5 backdrop-blur-xl">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-foreground/10">
        <Icon className="h-5 w-5 text-foreground/82" />
      </div>
      <h3 className="font-sans text-2xl font-light tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/76">{text}</p>
      {command && copyCommand ? (
        <button
          onClick={() => copyCommand(command)}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-foreground/12 bg-black/24 px-3 py-2 text-left transition hover:bg-foreground/10"
        >
          <code className="truncate font-mono text-xs text-foreground/82">{command}</code>
          {copiedCommand === command ? (
            <ShieldCheck className="h-4 w-4 shrink-0 text-foreground/78" />
          ) : (
            <Copy className="h-4 w-4 shrink-0 text-foreground/66" />
          )}
        </button>
      ) : null}
    </div>
  )
}
