'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Check, ExternalLink, Loader2 } from 'lucide-react';

interface ApiKeyData {
  apiKey?: string;
  email: string;
  customerId?: string;
  tier?: string;
  status?: string;
  created?: string;
  message?: string;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ApiKeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    const fetchApiKey = async () => {
      const sessionId = searchParams.get('session_id');
      const email = searchParams.get('email') || '';
      setEmailInput(email);

      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams();
        if (sessionId) params.set('session_id', sessionId);

        const response = await fetch(`/api/stripe/api-key?${params}`);
        const result = await response.json();

        if (!response.ok) {
          setError(result.error || 'Failed to retrieve API key');
          setLoading(false);
          return;
        }

        setData(result);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch API key:', err);
        setError('Network error. Please try again.');
        setLoading(false);
      }
    };

    fetchApiKey();
  }, [searchParams]);

  const copyToClipboard = async () => {
    if (!data?.apiKey) return;

    try {
      await navigator.clipboard.writeText(data.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openPortal = async () => {
    if (!data?.customerId) return;

    setPortalLoading(true);
    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: data.customerId }),
      });

      const result = await response.json();

      if (response.ok && result.url) {
        window.location.href = result.url;
      } else {
        alert('Failed to open portal: ' + (result.error || 'Unknown error'));
        setPortalLoading(false);
      }
    } catch (err) {
      console.error('Portal error:', err);
      alert('Network error. Please try again.');
      setPortalLoading(false);
    }
  };

  const handleEmailLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!emailInput || !apiKeyInput) {
      setError('Email and API key are required.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('email', emailInput);

      const response = await fetch(`/api/stripe/api-key?${params}`, {
        headers: {
          Authorization: `Bearer ${apiKeyInput}`,
        },
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to verify account.');
        setLoading(false);
        return;
      }

      setData(result);
      setLoading(false);
    } catch (err) {
      console.error('Failed to verify account:', err);
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-foreground mx-auto mb-4" />
          <p className="font-mono text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const showEmailLookup = !searchParams.get('session_id') && !data;

  if (showEmailLookup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full border border-border p-8 bg-card">
          <h1 className="font-heading text-2xl text-foreground mb-4">Access Dashboard</h1>
          <p className="font-mono text-xs text-muted-foreground mb-6">
            Enter your email and API key to view subscription status.
          </p>
          {error && (
            <p className="font-mono text-xs text-red-600 mb-4">{error}</p>
          )}
          <form onSubmit={handleEmailLookup} className="space-y-4">
            <div>
              <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-border bg-background font-mono text-sm"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-border bg-background font-mono text-sm"
                placeholder="sk_..."
                required
              />
            </div>
            <button
              type="submit"
              className="w-full font-mono text-xs tracking-wider uppercase border border-border px-6 py-3 hover:bg-foreground hover:text-background transition-colors"
            >
              Verify Access
            </button>
          </form>
          <div className="mt-6">
            <a
              href="/#pricing"
              className="inline-block font-mono text-xs tracking-wider uppercase border border-border px-6 py-3 hover:bg-foreground hover:text-background transition-colors"
            >
              Back to Pricing
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full border border-border p-8 bg-card">
          <h1 className="font-heading text-2xl text-foreground mb-4">Error</h1>
          <p className="font-mono text-sm text-muted-foreground mb-6">{error}</p>
          <a
            href="/#pricing"
            className="inline-block font-mono text-xs tracking-wider uppercase border border-border px-6 py-3 hover:bg-foreground hover:text-background transition-colors"
          >
            Back to Pricing
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-20 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-heading text-5xl md:text-6xl text-foreground tracking-tight mb-4">
            Your Dashboard
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            Account: {data?.email}
          </p>
        </div>

        {/* API Key Section (only shown if apiKey exists) */}
        {data?.apiKey && (
          <div className="border border-border p-8 mb-6 bg-card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-2">Your API Key</h2>
                <p className="font-mono text-xs text-muted-foreground max-w-lg">
                  {data.message || "Save this key securely. For security reasons, you won't be able to view it again after leaving this page."}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <div className="flex-1 font-mono text-sm bg-background border border-border px-4 py-3 break-all">
                {data.apiKey}
              </div>
              <button
                onClick={copyToClipboard}
                className="border border-border px-4 py-3 hover:bg-foreground hover:text-background transition-colors flex items-center gap-2"
                aria-label="Copy API key"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Quick Start */}
            <div className="mt-8 pt-6 border-t border-border">
              <h3 className="font-mono text-xs tracking-wider uppercase text-muted-foreground mb-4">
                Quick Start
              </h3>
              <pre className="bg-background border border-border p-4 overflow-x-auto">
                <code className="font-mono text-xs text-foreground">{`curl https://consensus-api.janis-ellerbrock.workers.dev/v1/chat/completions \\
  -H "Authorization: Bearer ${data.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "arc-router-v1",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Subscription Status */}
        {data?.tier && (
          <div className="border border-border p-8 mb-6 bg-card">
            <h2 className="font-heading text-2xl text-foreground mb-6">Subscription</h2>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Tier
                </p>
                <p className="font-mono text-sm text-foreground capitalize">{data.tier}</p>
              </div>

              <div>
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Status
                </p>
                <p className={`font-mono text-sm capitalize ${
                  data.status === 'active' ? 'text-green-600' :
                  data.status === 'past_due' ? 'text-yellow-600' :
                  'text-muted-foreground'
                }`}>
                  {data.status || 'Unknown'}
                </p>
              </div>

              {data.created && (
                <div className="col-span-2">
                  <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Created
                  </p>
                  <p className="font-mono text-sm text-foreground">
                    {new Date(data.created).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Manage Subscription Button */}
            {data.customerId && (
              <div className="mt-8 pt-6 border-t border-border">
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="w-full font-mono text-xs tracking-wider uppercase border border-border px-6 py-4 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {portalLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      Manage Subscription
                      <ExternalLink className="w-4 h-4" />
                    </>
                  )}
                </button>
                <p className="font-mono text-xs text-muted-foreground mt-3 text-center">
                  Update payment method, view invoices, or cancel subscription
                </p>
              </div>
            )}
          </div>
        )}

        {/* No API Key Message (for email lookups) */}
        {!data?.apiKey && data?.message && (
          <div className="border border-border p-8 mb-6 bg-card">
            <p className="font-mono text-sm text-muted-foreground">{data.message}</p>
          </div>
        )}

        {/* Documentation Link */}
        <div className="text-center mt-12">
          <a
            href="/docs"
            className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View Documentation
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-foreground" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
