import './globals.css'
import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono, Manrope, Space_Grotesk } from 'next/font/google'
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

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://councilrouter.ai'),
  title: 'CouncilRouter | Multi-Model Consensus Routing for AI',
  description: "Get higher reliability at a fraction of frontier-model cost. Multiple models, one consensus.",
  openGraph: {
    title: 'CouncilRouter',
    description: "Multiple Models. One Consensus. The Trust Layer for AI.",
    url: 'https://councilrouter.ai',
    siteName: 'CouncilRouter',
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
    title: 'CouncilRouter | Verified LLM Consensus',
    description: "Get GPT-4 level reliability at a fraction of the cost. Multiple models, one consensus.",
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrains.variable} ${manrope.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
