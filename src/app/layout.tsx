import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import "./globals.css"

/**
 * Space Grotesk, served from the repo rather than fetched from Google.
 *
 * next/font/google downloads the webfont at COMPILE time, and when that fetch
 * fails Next silently substitutes a metric-adjusted system font — the build
 * succeeds, the page renders, and the only symptom is that the whole app is in
 * the wrong typeface. That is not a hypothetical: it is what was happening
 * locally (ETIMEDOUT to fonts.googleapis.com from Node, while curl on the same
 * machine reached it fine), and the same failure would hit any build host with
 * restricted egress.
 *
 * The file is the upstream v22 variable font, latin subset — U+0000-00FF plus
 * punctuation, currency and arrows, which covers everything this app renders.
 * Space Grotesk is SIL OFL 1.1, so redistributing it here is permitted.
 */
const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-Variable-latin.woff2",
  // One variable file spans the range; the old config asked Google for 400,
  // 500 and 700 and got this same file back three times.
  weight: "300 700",
  style: "normal",
  display: "swap",
  variable: "--font-space-grotesk",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
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
