import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://arcrouter.com'
  const now = new Date()

  const routes = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
    { path: '/docs', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: '/rankings', priority: 0.9, changeFrequency: 'daily' as const },
    { path: '/research', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/enterprise', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/products/smart-router', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/products/on-chain-payments', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/products/agent-workflows', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/products/council', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/products/integrations', priority: 0.8, changeFrequency: 'monthly' as const },
  ]

  return routes.map(r => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))
}
