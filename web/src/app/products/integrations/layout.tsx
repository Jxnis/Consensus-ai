import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Integrations — OpenAI SDK, TypeScript SDK, MCP',
  description: 'Three ways to integrate ArcRouter: OpenAI SDK drop-in (change base URL), @arcrouter/sdk TypeScript package, or MCP server for Claude Code/Cursor/Cline.',
  openGraph: {
    title: 'ArcRouter — Integrations',
    description: 'OpenAI SDK drop-in, @arcrouter/sdk, MCP server. Pick the surface that matches your stack.',
    url: 'https://arcrouter.com/products/integrations',
  },
  alternates: { canonical: 'https://arcrouter.com/products/integrations' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
