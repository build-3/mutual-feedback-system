import type { Metadata } from "next"
import { Space_Grotesk } from "next/font/google"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  title: "build3 Feedback",
  description: "build3 feedback, reflections, and team insight in one place.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "build3",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
