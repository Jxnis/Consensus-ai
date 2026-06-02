import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'On-Chain Payments — MPP (Tempo) + x402 (Base) USDC',
  description: 'Pay-per-call LLM routing with on-chain payments. MPP (Tempo USDC) and x402 (Base USDC) on every endpoint. No signup, no API key, no subscription. Agent-to-agent settlement in sub-second.',
  openGraph: {
    title: 'ArcRouter — On-Chain Payments (MPP + x402)',
    description: 'Dual-rail USDC pay-per-call. MPP on Tempo, x402 on Base. Sign once with mppx or @arcrouter/sdk.',
    url: 'https://arcrouter.com/products/on-chain-payments',
  },
  alternates: { canonical: 'https://arcrouter.com/products/on-chain-payments' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
