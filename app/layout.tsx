import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "Gesture Bridge",
  description: "손동작 PC 제어, 수화 텍스트 인식, 한국어 음성 기반 인터랙티브 체험을 선택해서 실행하는 Gesture Bridge 프론트 화면입니다.",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-dark-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Gesture Bridge",
    description: "손동작, 수화 문장, 한국어 음성 명령을 연결하는 멀티모달 인터랙션 프로젝트입니다.",
    images: [
      {
        url: "/brand/gesture-bridge-banner.png",
        width: 1600,
        height: 900,
        alt: "Gesture Bridge 브랜드 배너",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
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
