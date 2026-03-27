import { api } from "../api";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export type BillingPlanSlug = "professional" | "team" | "business";
export type BillingCycle = "monthly" | "annual";

const PRICES_INR: Record<BillingPlanSlug, Record<BillingCycle, number>> = {
  professional: { monthly: 3299, annual: 31670 },
  team: { monthly: 6199, annual: 59510 },
  business: { monthly: 8299, annual: 79661 },
};

export const PLAN_FEATURES: Record<BillingPlanSlug, string[]> = {
  professional: ["PostgreSQL, MySQL, SQLite, MSSQL, Oracle", "500 AI messages/month", "Scheduled pipelines"],
  team: ["+Snowflake, Redshift, BigQuery", "Team collaboration + RBAC", "Unlimited AI messages"],
  business: ["SSO + governance", "Webhooks + advanced controls", "Lineage + audit"],
};

export function getDisplayPrice(plan: BillingPlanSlug, cycle: BillingCycle): string {
  const amount = PRICES_INR[plan]?.[cycle];
  if (!amount) return "";
  const suffix = cycle === "monthly" ? "/user/month" : "/user/year";
  return `₹${amount.toLocaleString("en-IN")}${suffix}`;
}

export function getAnnualSavings(plan: BillingPlanSlug): string {
  const monthly = PRICES_INR[plan]?.monthly;
  const annual = PRICES_INR[plan]?.annual;
  if (!monthly || !annual) return "";
  const saving = monthly * 12 - annual;
  return `₹${saving.toLocaleString("en-IN")}`;
}

async function ensureRazorpayScriptLoaded(): Promise<void> {
  if (window.Razorpay) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

export async function initiateSubscription(
  plan: BillingPlanSlug,
  billingCycle: BillingCycle,
  quantity: number = 1,
): Promise<void> {
  const response = await api.post("/billing/subscribe", {
    plan,
    billing_cycle: billingCycle,
    quantity,
  });

  const {
    subscription_id: subscriptionId,
    razorpay_key_id: razorpayKeyId,
  } = response.data as {
    subscription_id: string;
    razorpay_key_id: string;
  };

  await ensureRazorpayScriptLoaded();
  if (typeof window.Razorpay === "undefined") {
    throw new Error("Razorpay SDK is unavailable. Please refresh and try again.");
  }

  const planLabel = `${plan.charAt(0).toUpperCase() + plan.slice(1)} — ${billingCycle}`;
  const options = {
    key: razorpayKeyId,
    subscription_id: subscriptionId,
    name: "DataHub",
    description: planLabel,
    image: "/logo.png",
    theme: { color: "#5B6AF0" },
    prefill: {},
    handler: async (payload: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    }) => {
      await api.post("/billing/verify", payload);
      window.location.reload();
    },
    modal: {
      ondismiss: () => {
        // checkout dismissed by user
      },
    },
  };

  new window.Razorpay(options).open();
}

export async function fetchBillingStatus() {
  const response = await api.get("/billing/status");
  return response.data as {
    plan: string;
    subscription: {
      id?: string;
      user_id?: string;
      plan?: string;
      billing_cycle?: BillingCycle;
      status?: string;
      quantity?: number;
      current_start?: string;
      current_end?: string;
      razorpay_subscription_id?: string;
      short_url?: string;
    } | null;
    has_active_subscription: boolean;
  };
}

export async function cancelSubscription(atCycleEnd: boolean = true) {
  const response = await api.post("/billing/cancel", null, {
    params: { at_cycle_end: atCycleEnd },
  });
  return response.data;
}

export async function listInvoices() {
  const response = await api.get("/billing/invoices");
  return response.data as Array<{
    id: string;
    created_at?: number;
    date?: number;
    amount?: number;
    currency?: string;
    status?: string;
    short_url?: string;
    line_items?: Array<{ name?: string }>;
    quantity?: number;
    subscription_id?: string;
    customer_details?: { email?: string };
  }>;
}

export async function getInvoicePdfUrl(invoiceId: string): Promise<string> {
  const response = await api.get(`/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`);
  return String((response.data as { pdf_url?: string }).pdf_url || "");
}
