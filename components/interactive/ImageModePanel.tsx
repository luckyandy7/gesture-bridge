"use client"

import Image from "next/image"
import { ChevronRight, ImageIcon, Minus, Plus, RefreshCw, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import type { FloatingImagePanel } from "@/lib/interactive/types"

type ImageModePanelProps = {
  images: FloatingImagePanel[]
  selectedImageId: number
  onSelect: (imageId: number) => void
  onNext: () => void
  onPrevious: () => void
  onReset: () => void
  onHide: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}

export function ImageModePanel({
  images,
  selectedImageId,
  onSelect,
  onNext,
  onPrevious,
  onReset,
  onHide,
  onZoomIn,
  onZoomOut,
}: ImageModePanelProps) {
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? images[0]
  const sortedImages = [...images].sort((left, right) => {
    if (left.id === selectedImageId) return 1
    if (right.id === selectedImageId) return -1
    return left.id - right.id
  })

  return (
    <div className="pointer-events-none absolute inset-0 z-[26]">
      {sortedImages.map((image) => {
        if (!image.visible) return null
        const active = image.id === selectedImageId
        const width = active ? 360 * image.scale : 260 * image.scale
        return (
          <button
            key={image.id}
            onClick={() => onSelect(image.id)}
            className={`pointer-events-auto absolute overflow-hidden rounded-lg border bg-background/70 text-left shadow-2xl shadow-black/28 transition-all duration-300 ${
              active ? "z-20 border-white/48 ring-2 ring-white/12" : "z-10 border-white/16 opacity-82 hover:opacity-100"
            }`}
            style={{
              left: `${image.x * 100}%`,
              top: `${image.y * 100}%`,
              width: `${Math.round(width)}px`,
              maxWidth: "min(72vw, 430px)",
              transform: `translate(-50%, -50%) rotate(${image.rotation}deg)`,
            }}
            aria-label={`${image.title} 선택`}
          >
            <div className="relative aspect-[16/10] w-full">
              <Image src={image.src} alt={image.title} fill sizes="430px" className="object-cover" priority={active} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_54%,rgba(0,0,0,0.62))]" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="truncate text-sm font-semibold text-white">{image.title}</p>
                <p className="mt-0.5 text-[10px] text-white/62">{active ? "선택됨 · 집기로 이동" : "클릭해서 선택"}</p>
              </div>
            </div>
          </button>
        )
      })}

      <div className="pointer-events-auto absolute bottom-4 left-4 w-[min(520px,calc(100%-32px))] rounded-lg border border-foreground/10 bg-background/72 p-3 shadow-lg shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-foreground/48">사진 패널 · 손 제어</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{selectedImage?.title ?? "사진 없음"}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton label="이전 사진" onClick={onPrevious}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </IconButton>
            <IconButton label="다음 사진" onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <IconButton label="확대" onClick={onZoomIn}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton label="축소" onClick={onZoomOut}>
            <Minus className="h-4 w-4" />
          </IconButton>
          <IconButton label="숨기기" onClick={onHide}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/8 bg-foreground/6 px-2.5 py-2 text-xs text-foreground/66 transition hover:bg-foreground/11 hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            재배치
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((image) => (
            <button
              key={image.id}
              onClick={() => onSelect(image.id)}
              className={`min-w-[120px] rounded-lg border p-2 text-left transition ${
                image.id === selectedImageId
                  ? "border-foreground/36 bg-foreground/14 text-foreground"
                  : "border-foreground/8 bg-foreground/6 text-foreground/68 hover:border-foreground/20 hover:bg-foreground/11 hover:text-foreground"
              }`}
            >
              <span className="mb-1.5 flex items-center gap-1.5 text-[10px] text-foreground/46">
                <ImageIcon className="h-3 w-3" />
                {image.visible ? "표시 중" : "숨김"}
              </span>
              <span className="block truncate text-xs font-semibold">{image.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border border-foreground/12 bg-foreground/8 text-foreground/78 transition hover:bg-foreground/14 hover:text-foreground"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}
