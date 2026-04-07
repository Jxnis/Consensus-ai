import { Context } from "hono";
import Stripe from "stripe";
import { CloudflareBindings } from "../types";

/**
 * Stripe Integration for ArcRouter
 *
 * Handles:
 * - Checkout session creation (metered subscription)
 * - Webhook events (subscription lifecycle)
 * - Customer portal access
 * - Metered usage reporting
 *
 * IMPORTANT: Uses fetch-based HTTP client for Cloudflare Workers compatibility
 */

/**
 * Create a Stripe checkout session for metered subscription
 */
export async function createCheckoutSession(
  c: Context<{ Bindings: CloudflareBindings }>
): Promise<Response> {
  try {
    if (!c.env.STRIPE_SECRET_KEY) {
      return c.json({ error: "Stripe not configured" }, 500);
    }

    if (!c.env.STRIPE_PRICE_ID) {
      return c.json({ error: "Stripe price not configured" }, 500);
    }

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: c.env.STRIPE_PRICE_ID,
      }],
      subscription_data: {
        metadata: {
          source: 'arcrouter',
        },
      },
      success_url: 'https://arcrouter-web.janis-ellerbrock.workers.dev/dashboard?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://arcrouter-web.janis-ellerbrock.workers.dev#pricing',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_email: undefined, // Allow user to enter email
    });

    return c.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout session creation failed:', err);
    return c.json({
      error: "Failed to create checkout session",
      details: err instanceof Error ? err.message : "Unknown error"
    }, 500);
  }
}

/**
 * Create a Stripe customer portal session
 */
export async function createPortalSession(
  c: Context<{ Bindings: CloudflareBindings }>
): Promise<Response> {
  try {
    if (!c.env.STRIPE_SECRET_KEY) {
      return c.json({ error: "Stripe not configured" }, 500);
    }

    const body = await c.req.json<{ customer_id: string }>();

    if (!body.customer_id) {
      return c.json({ error: "customer_id required" }, 400);
    }

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: body.customer_id,
      return_url: 'https://arcrouter-web.janis-ellerbrock.workers.dev/dashboard',
    });

    return c.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Portal session creation failed:', err);
    return c.json({
      error: "Failed to create portal session",
      details: err instanceof Error ? err.message : "Unknown error"
    }, 500);
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhook(
  c: Context<{ Bindings: CloudflareBindings }>
): Promise<Response> {
  try {
    if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
      return c.json({ error: "Stripe not configured" }, 500);
    }

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const signature = c.req.header("stripe-signature");
    if (!signature) {
      return c.json({ error: "No signature" }, 400);
    }

    const body = await c.req.text();

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        c.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[Stripe] Webhook signature verification failed:', err);
      return c.json({ error: "Invalid signature" }, 400);
    }

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(c, stripe, event);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(c, stripe, event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(c, stripe, event);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(c, stripe, event);
        break;

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (err) {
    console.error('[Stripe] Webhook handling error:', err);
    return c.json({
      error: "Webhook processing failed",
      details: err instanceof Error ? err.message : "Unknown error"
    }, 500);
  }
}

/**
 * Handle checkout.session.completed event
 * Creates API key and stores subscription info
 */
async function handleCheckoutCompleted(
  c: Context<{ Bindings: CloudflareBindings }>,
  stripe: Stripe,
  event: Stripe.Event
) {
  const session = event.data.object as Stripe.Checkout.Session;

  // Retrieve subscription details to get subscription_item_id
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  const subscriptionItemId = subscription.items.data[0]?.id;
  if (!subscriptionItemId) {
    console.error('[Stripe] No subscription item found');
    return;
  }

  const customerEmail = session.customer_details?.email;
  const customerId = session.customer as string;

  if (!customerEmail) {
    console.error('[Stripe] No customer email in session');
    return;
  }

  // Generate API key
  const apiKey = `sk_${crypto.randomUUID().replace(/-/g, '')}`;
  const apiKeyHash = await hashApiKey(apiKey);

  // Store API key with subscription info in KV
  try {
    // Persist email on subscription metadata for future webhook events.
    try {
      await stripe.subscriptions.update(subscription.id, {
        metadata: {
          ...subscription.metadata,
          email: customerEmail,
        },
      });
    } catch (err) {
      console.error('[Stripe] Failed to update subscription metadata (non-fatal):', err);
    }

    await c.env.CONSENSUS_CACHE.put(
      `apikey:${apiKeyHash}`,
      JSON.stringify({
        email: customerEmail,
        tier: "paid",
        customerId,
        stripeSubscriptionId: session.subscription,
        subscriptionItemId,
        status: 'active',
        created: new Date().toISOString(),
      })
    );

    // Store reverse lookup: email → API key hash
    await c.env.CONSENSUS_CACHE.put(
      `email:${customerEmail}`,
      apiKeyHash
    );

    // Store reverse lookup: customerId → API key hash (used for webhook updates)
    if (customerId) {
      await c.env.CONSENSUS_CACHE.put(
        `customer:${customerId}`,
        apiKeyHash
      );
    }

    // Store session mapping for 24-hour retrieval (allows user to get API key from dashboard)
    await c.env.CONSENSUS_CACHE.put(
      `stripe_session:${session.id}`,
      JSON.stringify({
        apiKey,  // Store the PLAIN API key here (only accessible via session_id for 24h)
        email: customerEmail,
        customerId,
      }),
      { expirationTtl: 86400 }  // 24 hours
    );

    console.log(`[Stripe] Provisioned API key for ${customerEmail}, subscription ${session.subscription}`);

    // TODO: Send email with API key for backup delivery
  } catch (kvErr) {
    console.error('[Stripe] KV storage failed (non-fatal):', kvErr);
    // Continue anyway - subscription is active, can be manually provisioned
  }
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(
  c: Context<{ Bindings: CloudflareBindings }>,
  stripe: Stripe,
  event: Stripe.Event
) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  try {
    const email = subscription.metadata?.email;
    let apiKeyHash: string | null = null;

    if (customerId) {
      apiKeyHash = await c.env.CONSENSUS_CACHE.get(`customer:${customerId}`);
    }

    if (!apiKeyHash && email) {
      apiKeyHash = await c.env.CONSENSUS_CACHE.get(`email:${email}`);
    }

    if (!apiKeyHash) {
      console.warn(`[Stripe] No API key found for customer ${customerId || 'unknown'}`);
      return;
    }

    const keyData = await c.env.CONSENSUS_CACHE.get(`apikey:${apiKeyHash}`);
    if (!keyData) {
      console.warn(`[Stripe] No key data found for hash ${apiKeyHash}`);
      return;
    }

    const data = JSON.parse(keyData);
    data.status = subscription.status;
    data.updated = new Date().toISOString();

    await c.env.CONSENSUS_CACHE.put(`apikey:${apiKeyHash}`, JSON.stringify(data));

    console.log(`[Stripe] Updated subscription status to ${subscription.status} for ${data.email || customerId}`);
  } catch (kvErr) {
    console.error('[Stripe] Subscription update failed (non-fatal):', kvErr);
  }
}

/**
 * Handle customer.subscription.deleted event
 * Revokes API key, downgrades to free
 */
async function handleSubscriptionDeleted(
  c: Context<{ Bindings: CloudflareBindings }>,
  stripe: Stripe,
  event: Stripe.Event
) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  try {
    const email = subscription.metadata?.email;
    let apiKeyHash: string | null = null;

    if (customerId) {
      apiKeyHash = await c.env.CONSENSUS_CACHE.get(`customer:${customerId}`);
    }

    if (!apiKeyHash && email) {
      apiKeyHash = await c.env.CONSENSUS_CACHE.get(`email:${email}`);
    }

    if (!apiKeyHash) {
      console.warn(`[Stripe] No API key found for customer ${customerId || 'unknown'}`);
      return;
    }

    const keyData = await c.env.CONSENSUS_CACHE.get(`apikey:${apiKeyHash}`);
    if (!keyData) {
      console.warn(`[Stripe] No key data found for hash ${apiKeyHash}`);
      return;
    }

    const data = JSON.parse(keyData);
    data.tier = "free";
    data.status = "canceled";
    data.stripeSubscriptionId = undefined;
    data.subscriptionItemId = undefined;
    data.updated = new Date().toISOString();

    await c.env.CONSENSUS_CACHE.put(`apikey:${apiKeyHash}`, JSON.stringify(data));

    console.log(`[Stripe] Downgraded ${data.email || customerId} to free tier (subscription canceled)`);
  } catch (kvErr) {
    console.error('[Stripe] Subscription deletion handling failed (non-fatal):', kvErr);
  }
}

/**
 * Handle invoice.payment_failed event
 * Temporary downgrade to free (subscription may recover if payment succeeds)
 */
async function handlePaymentFailed(
  c: Context<{ Bindings: CloudflareBindings }>,
  stripe: Stripe,
  event: Stripe.Event
) {
  const invoice = event.data.object as Stripe.Invoice;
  const subscription = invoice.subscription;

  if (!subscription) {
    return;
  }

  // Retrieve subscription to get customer + metadata
  const subscriptionData = await stripe.subscriptions.retrieve(subscription as string);
  const customerId = subscriptionData.customer as string;
  const email = subscriptionData.metadata?.email;

  try {
    let apiKeyHash: string | null = null;

    if (customerId) {
      apiKeyHash = await c.env.CONSENSUS_CACHE.get(`customer:${customerId}`);
    }

    if (!apiKeyHash && email) {
      apiKeyHash = await c.env.CONSENSUS_CACHE.get(`email:${email}`);
    }

    if (!apiKeyHash) {
      return;
    }

    const keyData = await c.env.CONSENSUS_CACHE.get(`apikey:${apiKeyHash}`);
    if (!keyData) {
      return;
    }

    const data = JSON.parse(keyData);
    data.status = "past_due";
    data.updated = new Date().toISOString();

    await c.env.CONSENSUS_CACHE.put(`apikey:${apiKeyHash}`, JSON.stringify(data));

    console.log(`[Stripe] Payment failed for ${data.email || customerId}, marked as past_due`);

    // TODO: Send email notification about payment failure
  } catch (kvErr) {
    console.error('[Stripe] Payment failure handling failed (non-fatal):', kvErr);
  }
}

/**
 * Report metered usage to Stripe
 * IMPORTANT: This should be called via c.executionCtx.waitUntil() to avoid blocking the response
 */
export async function reportUsage(
  stripeSecretKey: string,
  subscriptionItemId: string,
  quantity: number = 1
): Promise<void> {
  try {
    const stripe = new Stripe(stripeSecretKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    await stripe.subscriptionItems.createUsageRecord(
      subscriptionItemId,
      {
        quantity,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment',
      }
    );
  } catch (err) {
    console.error('[Stripe] Usage reporting failed:', err);
    // Don't throw - usage reporting failures should not block requests
  }
}

/**
 * Hash API key using SHA-256
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
