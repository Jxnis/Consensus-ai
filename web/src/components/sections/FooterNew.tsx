const FooterNew = () => (
  <footer className="border-t border-border px-8">
    <div className="max-w-[1400px] mx-auto py-6 flex items-center justify-between">
      <span className="font-heading text-sm text-foreground">© 2026 ConsensusCloud</span>
      <div className="flex items-center gap-8">
        <a href="#" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-300 uppercase">
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
