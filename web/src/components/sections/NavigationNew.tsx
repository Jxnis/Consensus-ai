import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { motion } from "motion/react";

const navLinks = [
  { label: "DOCS", href: "/docs" },
  { label: "PRICING", href: "#pricing" },
  { label: "PLAYGROUND", href: "#playground" },
];

const NavigationNew = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70"
    >
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-8 h-16">
        <a href="#" className="font-heading text-lg text-foreground tracking-tight">
          ConsensusCloud
        </a>

        <div className="flex items-center gap-10">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-all duration-300 relative group"
            >
              {link.label}
              <span className="absolute -bottom-1 left-0 w-full h-px bg-foreground origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]" />
            </a>
          ))}

          <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors duration-300"
            aria-label="Toggle theme"
          >
            <motion.div
              key={theme}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </motion.div>
          </button>
        </div>
      </div>
    </motion.nav>
  );
};

export default NavigationNew;
