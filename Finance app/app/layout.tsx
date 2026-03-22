import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "Nadav's Finance Tracker",
  description: "מעקב פיננסי אישי",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-slate-900 text-white min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
