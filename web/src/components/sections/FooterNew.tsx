import ArcLogo from "../ArcLogo";

const FooterNew = () => (
  <footer className="border-t border-border px-8 bg-background">
    <div className="max-w-[1400px] mx-auto py-12 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <ArcLogo className="w-12 h-12 text-foreground" />
        <span className="font-heading text-sm text-foreground">© 2026 ArcRouter</span>
      </div>
      <div className="flex items-center gap-8">
        <a href="/docs" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-300 uppercase">
          Docs
        </a>
        <a href="https://github.com/ArcRouterAI" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-300 uppercase">
          GitHub
        </a>
        <a href="https://www.npmjs.com/package/@arcrouter/sdk" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-300 uppercase">
          npm
        </a>
      </div>
    </div>
  </footer>
);

export default FooterNew;
