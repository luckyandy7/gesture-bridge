"use client"

export function StageBackdropFallback() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(0,102,255,0.34),transparent_28%),radial-gradient(circle_at_82%_36%,rgba(225,145,54,0.30),transparent_30%),linear-gradient(180deg,rgba(10,16,34,0.96),rgba(0,0,0,0.86))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(0,102,255,0.28),transparent_28%),radial-gradient(circle_at_82%_36%,rgba(225,145,54,0.22),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.76))]" />
      <div className="absolute inset-0 bg-black/22" />
    </>
  )
}
