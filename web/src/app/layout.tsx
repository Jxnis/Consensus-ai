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
  metadataBase: new URL('https://arcrouter.com'),
  title: {
    default: 'ArcRouter — Agent-Native LLM Router with On-Chain Payments',
    template: '%s | ArcRouter',
  },
  description: 'Route any prompt to the best AI model with built-in agent-to-agent payments. MPP (Tempo) + x402 (Base) USDC, no signup. 345+ benchmarked models, council verification, workflow budgets. OpenAI SDK compatible.',
  keywords: [
    'LLM router', 'AI model router', 'agent payments', 'x402', 'MPP', 'machine payments protocol',
    'agent-to-agent payments', 'USDC payments', 'MCP server', 'Claude Code MCP',
    'multi-model verification', 'council mode', 'workflow budget', 'smart routing',
    'benchmark scores', 'AI cost savings', 'OpenAI compatible', 'Cloudflare Workers',
  ],
  authors: [{ name: 'ArcRouter' }],
  creator: 'ArcRouter',
  publisher: 'ArcRouter',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: 'ArcRouter — Agent-Native LLM Router with On-Chain Payments',
    description: 'Smart routing across 345+ models. MPP + x402 USDC pay-per-call. Council verification. Workflow budgets. OpenAI SDK compatible. Built for agents.',
    url: 'https://arcrouter.com',
    siteName: 'ArcRouter',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ArcRouter — Agent-Native LLM Router',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ArcRouter — Agent-Native LLM Router. Pay-per-call USDC.',
    description: 'Smart routing + MPP/x402 micropayments. Council verification. 345+ models. OpenAI SDK compatible.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: 'https://arcrouter.com',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'ArcRouter',
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Web',
              description: 'Agent-native LLM router with on-chain payments (MPP/x402). Smart routing across 345+ benchmarked models, council verification, workflow budgets. Up to 90% cheaper than single-model APIs.',
              url: 'https://arcrouter.com',
              offers: [
                {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'USD',
                  name: 'Free Tier',
                  description: '20 requests/hour, free models, no API key required',
                },
                {
                  '@type': 'Offer',
                  price: '0.001',
                  priceCurrency: 'USD',
                  name: 'Pay-per-call',
                  description: 'Tier-priced: SIMPLE $0.001, MEDIUM $0.002, COMPLEX $0.005, REASONING $0.012, PREMIUM $0.015. MPP/x402 USDC.',
                },
              ],
              featureList: [
                'Smart routing across 345+ AI models',
                'Agent-to-agent payments via MPP (Tempo) and x402 (Base)',
                'Council mode for multi-model verification',
                'Workflow budgets with auto-downgrade',
                'X-Agent-Step header for agentic routing',
                'MCP server for Claude Code, Cursor, Cline',
                'OpenAI SDK compatible (drop-in)',
                'Daily benchmark updates from HuggingFace, LiveBench, LiveCodeBench',
              ],
            }),
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
