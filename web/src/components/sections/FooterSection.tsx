"use client";

/**
 * Footer — MCPay-style minimal footer with dark mode support
 */
export const FooterSection = () => {
  return (
    <footer className="w-full border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Logo + copyright */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#111827] dark:bg-white rounded-lg flex items-center justify-center">
            <span className="text-white dark:text-[#111827] font-black text-xs">C</span>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            © {new Date().getFullYear()} ConsensusCloud
          </span>
        </div>

        {/* Right: Links */}
        <div className="flex items-center gap-6">
          <a
            href="/docs"
            className="text-xs font-bold text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors uppercase tracking-widest"
          >
            Learn More
          </a>
          <a
            href="https://github.com/consensuscloud"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors uppercase tracking-widest"
          >
            GitHub
          </a>
          <a
            href="https://x.com/consensuscloud"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors uppercase tracking-widest"
          >
            X
          </a>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
