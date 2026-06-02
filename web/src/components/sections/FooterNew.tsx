import ArcLogo from "../ArcLogo";

const columns: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Smart Router", href: "/products/smart-router" },
      { label: "On-Chain Payments", href: "/products/on-chain-payments" },
      { label: "Agent Workflows", href: "/products/agent-workflows" },
      { label: "Council Verification", href: "/products/council" },
      { label: "Integrations", href: "/products/integrations" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "API Reference", href: "/docs#api-reference" },
      { label: "SDK", href: "https://www.npmjs.com/package/@arcrouter/sdk", external: true },
      { label: "MCP Server", href: "/docs#mcp" },
      { label: "GitHub", href: "https://github.com/ArcRouterAI", external: true },
      { label: "Health", href: "https://api.arcrouter.com/health", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Rankings", href: "/rankings" },
      { label: "Research", href: "/research" },
      { label: "Enterprise", href: "/enterprise" },
      { label: "Contact", href: "mailto:janis.ellerbrock@gmail.com" },
    ],
  },
];

const FooterNew = () => (
  <footer className="border-t border-border px-8 bg-background">
    <div className="max-w-[1400px] mx-auto pt-16 pb-10">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-10 md:gap-8">
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-5">
              {col.title}
            </h3>
            <ul className="space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="font-mono text-[11px] text-foreground hover:text-muted-foreground transition-colors duration-300"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <ArcLogo className="w-10 h-10 text-foreground" />
          <span className="font-heading text-sm text-foreground">© 2026 ArcRouter</span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
          Agents transact. On-chain.
        </span>
      </div>
    </div>
  </footer>
);

export default FooterNew;
