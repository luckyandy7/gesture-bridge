"use client"

export function HomeBackdropFallback() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 24%, rgba(18, 117, 216, 0.72), transparent 34%), radial-gradient(circle at 78% 38%, rgba(225, 145, 54, 0.66), transparent 32%), linear-gradient(120deg, rgba(0, 102, 255, 0.38), rgba(209, 209, 209, 0.16) 46%, rgba(225, 145, 54, 0.46))",
        }}
      />
      <div
        className="absolute inset-0 opacity-85 mix-blend-screen"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 24%, rgba(18, 117, 216, 0.78), transparent 34%), radial-gradient(circle at 78% 38%, rgba(225, 145, 54, 0.72), transparent 32%), linear-gradient(120deg, rgba(0, 102, 255, 0.42), rgba(209, 209, 209, 0.18) 46%, rgba(225, 145, 54, 0.5))",
        }}
      />
      <div className="absolute inset-0 bg-black/20" />
    </>
  )
}
