import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Documentation — API Reference, SDKs & Integration Guide',
  description: 'Complete API documentation for ArcRouter. OpenAI-compatible endpoints, request parameters, response formats, streaming, authentication, and SDK integration guides for Python, TypeScript, and more.',
  openGraph: {
    title: 'ArcRouter Documentation — API Reference & SDKs',
    description: 'Complete API docs: OpenAI-compatible endpoints, smart routing, council mode, streaming, authentication. Drop-in replacement for OpenAI SDK.',
    url: 'https://arcrouter.ai/docs',
  },
  alternates: {
    canonical: 'https://arcrouter.ai/docs',
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
