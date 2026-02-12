import './globals.css'
import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono, Manrope } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'

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
  metadataBase: new URL('https://consensuscloud.ai'),
  title: 'Consensus Cloud | Multi-Model Consensus Routing for AI',
  description: 'Get GPT-4 level reliability at a fraction of the cost. The world\'s first verified LLM router. Multiple models, one consensus.',
  openGraph: {
    title: 'Consensus Cloud',
    description: 'Multiple Models. One Consensus. The Trust Layer for AI.',
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
  twitter: {
    card: 'summary_large_image',
    title: 'Consensus Cloud | Multi-Model Consensus Routing',
    description: 'Get GPT-4 level reliability at a fraction of the cost. Multiple models, one consensus.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrains.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
