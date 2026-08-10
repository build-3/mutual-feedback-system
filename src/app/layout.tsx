import type { Metadata, Viewport } from "next"
import { Space_Grotesk } from "next/font/google"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: "build3 — internal feedback",
  description: "build3's internal feedback system. peer reviews, self-reflections, and team insight in one place.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "build3",
  },
  // appleWebApp.capable emits only <meta name="apple-mobile-web-app-capable">,
  // which Chrome now warns is deprecated in favour of the standardised name.
  // Both are needed: iOS Safari still reads the apple- prefixed tag, so this
  // adds the standard one rather than replacing it. Next has no first-class
  // field for it, hence `other`.
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "build3 — internal feedback",
    description: "build3's internal feedback system. peer reviews, self-reflections, and team insight in one place.",
    siteName: "build3",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online",
  },
  twitter: {
    card: "summary",
    title: "build3 — internal feedback",
    description: "build3's internal feedback system. peer reviews, self-reflections, and team insight in one place.",
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
