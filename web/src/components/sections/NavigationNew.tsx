import { useTheme } from "../ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import CouncilLogo from "../CouncilLogo";
import { useEffect, useState } from "react";

const navLinks = [
  { label: "DOCS", href: "/docs" },
  { label: "PRICING", href: "#pricing" },
  { label: "PLAYGROUND", href: "#playground" },
];

const NavigationNew = () => {
  const { theme, toggleTheme } = useTheme();
  const [isFullText, setIsFullText] = useState(true);

  // Cycle animation state
  useEffect(() => {
    const cycle = async () => {
      // Stay on "CouncilRouter" for 5 seconds
      await new Promise(r => setTimeout(r, 5000));
      setIsFullText(false);
      
      // Stay on "CR" for 2 seconds
      await new Promise(r => setTimeout(r, 2000));
      setIsFullText(true);
    };

    // Run loop
    const interval = setInterval(cycle, 8000); 
    return () => clearInterval(interval);
  }, []);

  const textVariants = {
    hidden: { opacity: 0, x: -5 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, width: 0, transition: { duration: 0.2 } }
  };

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40"
    >
      <div className="max-w-[1400px] mx-auto px-8 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-1 group">
            <CouncilLogo className="w-8 h-8 text-foreground transition-transform duration-500 group-hover:rotate-180" />
            
            <div className="font-heading font-bold text-lg tracking-tight flex items-center overflow-hidden h-6">
              <AnimatePresence mode="wait">
                {isFullText ? (
                  <motion.div 
                    key="full"
                    initial="hidden" animate="visible" exit="hidden"
                    variants={{
                      visible: { transition: { staggerChildren: 0.03 } }
                    }}
                    className="flex"
                  >
                    {"CouncilRouter".split("").map((char, i) => (
                      <motion.span key={i} variants={textVariants}>
                        {char}
                      </motion.span>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div 
                    key="short"
                    initial="hidden" animate="visible" exit="hidden"
                    variants={{
                      visible: { transition: { staggerChildren: 0.1 } }
                    }}
                    className="flex"
                  >
                    <motion.span variants={textVariants}>C</motion.span>
                    <motion.span variants={textVariants}>R</motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
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
