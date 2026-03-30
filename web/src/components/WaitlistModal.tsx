"use client";

import { useState } from "react";
import { X, Mail, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: "free" | "developer" | "team";
}

export default function WaitlistModal({ isOpen, onClose, tier }: WaitlistModalProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [position, setPosition] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setPosition(data.position);
        setEmail("");
      } else {
        setError(data.error || "Failed to join waitlist");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setError("");
    setEmail("");
    setPosition(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {!success ? (
                <>
                  {/* Header */}
                  <div className="mb-6">
                    <h3 className="font-heading text-2xl font-bold text-foreground mb-2">
                      Join the Waitlist
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {tier === "developer"
                        ? "We're preparing for launch. Be the first to know when billing goes live."
                        : "Get early access to ArcRouter's team features."}
                    </p>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                        Email address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          disabled={loading}
                          className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !email}
                      className="w-full py-3 px-4 bg-foreground text-background font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {loading ? "Joining..." : "Join Waitlist"}
                    </button>
                  </form>

                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    We'll notify you as soon as billing is ready. No spam, ever.
                  </p>
                </>
              ) : (
                <>
                  {/* Success state */}
                  <div className="text-center py-4">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="font-heading text-2xl font-bold text-foreground mb-2">
                      You're on the list!
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {position && position > 1
                        ? `You're #${position} on the waitlist.`
                        : "You're one of the first on the waitlist!"}
                    </p>
                    <p className="text-sm text-muted-foreground mb-6">
                      We'll email you as soon as billing launches. In the meantime, try the free tier — no signup needed.
                    </p>
                    <button
                      onClick={handleClose}
                      className="px-6 py-2 bg-foreground text-background font-medium rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Got it
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
