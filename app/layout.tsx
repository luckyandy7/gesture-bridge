import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "Gesture Bridge",
  description: "손동작 PC 제어, 수화 텍스트 인식, 한국어 음성 기반 인터랙티브 체험을 선택해서 실행하는 Gesture Bridge 프론트 화면입니다.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
