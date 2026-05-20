"use client"

export function SignTextBackdropFallback() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#030611,#08101f_52%,#130d08)]" />
      <div className="absolute inset-0 bg-black/54" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_24%,rgba(18,117,216,0.48),transparent_32%),radial-gradient(circle_at_80%_42%,rgba(225,145,54,0.42),transparent_30%)]" />
    </>
  )
}
