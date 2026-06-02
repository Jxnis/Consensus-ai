import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agent Workflows — X-Agent-Step, Budgets, Session Pinning',
  description: 'LLM routing built for multi-step agent runs. X-Agent-Step header overrides routing per step. Workflow budgets with auto-downgrade. Session model pinning. Tool-call enforcement.',
  openGraph: {
    title: 'ArcRouter — Agent Workflows',
    description: 'Built for agents. X-Agent-Step, workflow budgets, session pinning, tool-call enforcement.',
    url: 'https://arcrouter.com/products/agent-workflows',
  },
  alternates: { canonical: 'https://arcrouter.com/products/agent-workflows' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
