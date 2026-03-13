import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Research — Benchmark Results & Scientific Evaluation',
  description: 'Rigorous evaluation of ArcRouter against single-model baselines across 6 datasets. Reproducible results with bootstrap confidence intervals, calibration metrics, and cost-per-quality analysis.',
  openGraph: {
    title: 'ArcRouter Research — Scientific Benchmark Results',
    description: 'Multi-model consensus vs single-model baselines. 172 test cases, 6 datasets, bootstrap confidence intervals. All results reproducible and auto-graded.',
    url: 'https://arcrouter.ai/research',
  },
  alternates: {
    canonical: 'https://arcrouter.ai/research',
  },
}

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return children
}
