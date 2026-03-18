import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Model Rankings — 345+ LLMs Scored Across 6 Domains',
  description: 'Live benchmark rankings for 345+ language models. Quality and value scores across code, math, science, writing, reasoning, and general domains. Data from HuggingFace, LiveBench, and LiveCodeBench, updated daily.',
  openGraph: {
    title: 'ArcRouter Model Rankings — Live LLM Benchmark Scores',
    description: 'Compare 345+ AI models by benchmark score, price, and value across 6 domains. Updated daily from HuggingFace, LiveBench, and LiveCodeBench.',
    url: 'https://arcrouter.ai/rankings',
  },
  alternates: {
    canonical: 'https://arcrouter.ai/rankings',
  },
}

export default function RankingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
