import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Smart Router — Hybrid Semantic Routing',
  description: 'Hybrid LLM router: lexical prefilter, D1 shortlist, embedding reranker. 345+ models scored on LiveBench, LiveCodeBench, GPQA, HuggingFace. Sub-millisecond classification.',
  openGraph: {
    title: 'ArcRouter — Smart Router',
    description: 'Hybrid semantic routing across 345+ benchmark-scored models. 24 topic categories, 4 complexity tiers.',
    url: 'https://arcrouter.com/products/smart-router',
  },
  alternates: { canonical: 'https://arcrouter.com/products/smart-router' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
