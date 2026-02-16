import CouncilLogo from "../CouncilLogo";

const FooterNew = () => (
  <footer className="border-t border-border px-8 bg-background">
    <div className="max-w-[1400px] mx-auto py-12 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <CouncilLogo className="w-8 h-8 text-foreground" />
        <span className="font-heading text-sm text-foreground">© 2026 CouncilRouter</span>
      </div>
      <div className="flex items-center gap-8">
        <a href="/docs" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-300 uppercase">
          Docs
        </a>
        <a href="#" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-300 uppercase">
          GitHub
        </a>
      </div>
    </div>
  </footer>
);

export default FooterNew;
