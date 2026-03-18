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
  metadataBase: new URL('https://arcrouter.ai'),
  title: {
    default: 'ArcRouter — Smart LLM Router | Best Model for Every Prompt',
    template: '%s | ArcRouter',
  },
  description: 'Route any prompt to the best AI model automatically. Up to 90% cheaper than GPT-4o with benchmark-verified quality. 345+ models, 24 topic categories, semantic routing.',
  keywords: ['LLM router', 'AI model router', 'smart routing', 'benchmark scores', 'cost optimization', 'OpenAI alternative', 'GPT-4o cheaper', 'multi-model', 'AI API', 'language model'],
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
    title: 'ArcRouter — Best Model for Every Prompt, 90% Cheaper',
    description: 'Auto-route any prompt to the best AI model based on real benchmark scores. 345+ models, 24 topic categories, daily updates. OpenAI SDK compatible.',
    url: 'https://arcrouter.ai',
    siteName: 'ArcRouter',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ArcRouter — Smart LLM Router',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ArcRouter — Smart LLM Router | 90% Cheaper Than GPT-4o',
    description: 'Auto-route any prompt to the best AI model. Benchmark-verified quality at a fraction of the cost. OpenAI SDK compatible.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: 'https://arcrouter.ai',
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
              description: 'Smart LLM router that auto-routes prompts to the best AI model based on benchmark scores. Up to 90% cheaper than GPT-4o.',
              url: 'https://arcrouter.ai',
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
                  price: '0.002',
                  priceCurrency: 'USD',
                  name: 'Developer Tier',
                  description: '$0.002 per request, 345+ models, 1000 req/hour',
                },
              ],
              featureList: [
                'Smart routing across 345+ AI models',
                '24 granular topic categories',
                'Semantic routing with embedding-based reranking',
                'Up to 90% cost savings vs GPT-4o',
                'OpenAI SDK compatible',
                'Full SSE streaming support',
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
