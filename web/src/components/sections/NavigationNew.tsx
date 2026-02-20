import { useTheme } from "../ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import CouncilLogo from "../CouncilLogo";
import { useEffect, useState } from "react";

const navLinks = [
  { label: "DOCS", href: "/docs" },
  { label: "RESEARCH", href: "/research" },
  { label: "PRICING", href: "#pricing" },
  { label: "PLAYGROUND", href: "#playground" },
];

function AnimatedTitle({
  initialText,
  finalText,
}: {
  initialText: string;
  finalText: string;
}) {
  const [displayText, setDisplayText] = useState("");
  const [isFinalStage, setIsFinalStage] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const timeouts: Array<ReturnType<typeof setTimeout>> = [];
    let buffer = "";

    const typingDelayMs = 70;
    const deletingDelayMs = 50;
    const holdDurationMs = 10000; // Longer hold as requested

    const typeInitial = (index: number) => {
      if (!isMounted) return;
      if (index < initialText.length) {
        buffer += initialText[index];
        setDisplayText(buffer);
        timeouts.push(setTimeout(() => typeInitial(index + 1), typingDelayMs));
      } else {
        timeouts.push(setTimeout(() => deleteText(buffer.length), holdDurationMs));
      }
    };

    const deleteText = (remaining: number) => {
      if (!isMounted) return;
      if (remaining > 0) {
        buffer = buffer.slice(0, -1);
        setDisplayText(buffer);
        timeouts.push(setTimeout(() => deleteText(remaining - 1), deletingDelayMs));
      } else {
        setIsFinalStage(true);
        typeFinal(0);
      }
    };

    const typeFinal = (index: number) => {
      if (!isMounted) return;
      if (index < finalText.length) {
        buffer += finalText[index];
        setDisplayText(buffer);
        timeouts.push(setTimeout(() => typeFinal(index + 1), typingDelayMs));
      } else {
        // Hold final state then restart
        timeouts.push(setTimeout(() => {
           if(isMounted) {
             setIsFinalStage(false);
             setCycleCount(c => c + 1);
           }
        }, holdDurationMs));
      }
    };

    typeInitial(0);

    return () => {
      isMounted = false;
      timeouts.forEach(clearTimeout);
    };
  }, [initialText, finalText, cycleCount]);

  if (isFinalStage) {
    const slashIndex = displayText.indexOf("/");
    if (slashIndex !== -1) {
      const before = displayText.slice(0, slashIndex);
      const after = displayText.slice(slashIndex);
      return (
        <span className="flex items-center">
          <span>{before}</span>
          <span className="text-muted-foreground opacity-50">{after}</span>
        </span>
      );
    }
  }

  return <span className="flex items-center">{displayText}</span>;
}

const NavigationNew = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40"
    >
      <div className="max-w-[1400px] mx-auto px-8 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-1 group">
            <CouncilLogo className="w-12 h-12 text-foreground transition-transform duration-500 group-hover:rotate-180" />
            
            <div className="font-heading font-bold text-lg tracking-tight flex items-center overflow-hidden h-6 min-w-[150px]">
              <AnimatedTitle 
                initialText="CouncilRouter" 
                finalText="CR" 
              />
            </div>
        </a>

        <div className="hidden md:flex items-center gap-8">
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
