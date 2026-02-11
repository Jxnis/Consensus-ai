import './globals.css'
import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono, Manrope } from 'next/font/google'

const outfit = Outfit({ 
  subsets: ['latin'],
  variable: '--font-outfit',
})

const jetbrains = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-jetbrains',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
})

export const metadata: Metadata = {
  title: 'Consensus Cloud | The World\'s First LLM Arbitrage Network',
  description: 'Eliminate hallucinations and reduce costs with a council of models. Verified intelligence for the agentic era.',
  openGraph: {
    title: 'Consensus Cloud',
    description: 'The Trust Layer for AI.',
    url: 'https://consensuscloud.ai',
    siteName: 'Consensus Cloud',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrains.variable} ${manrope.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
