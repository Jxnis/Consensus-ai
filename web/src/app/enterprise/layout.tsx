import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Enterprise — EU Edge, Zero Data Retention, BYOK',
  description: 'ArcRouter for teams. EU edge processing on Cloudflare, zero data retention by default, bring-your-own-keys, dedicated SLA. Built for European teams that want LLM routing without storing prompts.',
  openGraph: {
    title: 'ArcRouter Enterprise — EU Edge & ZDR',
    description: 'LLM routing infrastructure for European teams. EU edge processing, ZDR by default, BYOK option, dedicated SLA.',
    url: 'https://arcrouter.com/enterprise',
  },
  alternates: {
    canonical: 'https://arcrouter.com/enterprise',
  },
}

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
  return children
}
