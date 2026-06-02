import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Council Verification — Multi-Model Agreement Mode',
  description: 'Multi-model verification on demand. 3-7 models answer in parallel, embedding-based agreement scoring, Chairman synthesis on disagreement. Add mode: "council" to any OpenAI-compatible request.',
  openGraph: {
    title: 'ArcRouter — Council Verification',
    description: 'Multi-model agreement scoring. Embedding cosine on paid, Jaccard on free. Chairman synthesis when models disagree.',
    url: 'https://arcrouter.com/products/council',
  },
  alternates: { canonical: 'https://arcrouter.com/products/council' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
