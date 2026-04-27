import { api } from "../api";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export type BillingPlanSlug = "professional" | "team" | "business";
export type BillingCycle = "monthly";
export type BillingCurrency = "INR" | "USD";

const PRICES: Record<BillingCurrency, Record<BillingPlanSlug, Record<BillingCycle, number>>> = {
  INR: {
    professional: { monthly: 6999 },
    team: { monthly: 14999 },
    business: { monthly: 29999 },
  },
  USD: {
    professional: { monthly: 149 },
    team: { monthly: 299 },
    business: { monthly: 599 },
  },
};

export const INCLUDED_SEATS: Record<BillingPlanSlug, number> = {
  professional: 1,
  team: 3,
  business: 5,
};

export const EXTRA_SEAT_PRICE: Record<BillingCurrency, Record<string, number>> = {
  INR: { team: 2499, business: 3999 },
  USD: { team: 49, business: 79 },
};

/** @deprecated kept for back-compat, prefer EXTRA_SEAT_PRICE. */
export const EXTRA_SEAT_PRICE_INR: Record<string, number> = EXTRA_SEAT_PRICE.INR;

export const PLAN_FEATURES: Record<BillingPlanSlug, string[]> = {
  professional: ["PostgreSQL, MySQL, SQLite, MSSQL, Oracle", "S3, GCS, Azure Blob storage", "2,000 AI messages/month", "Scheduled pipelines"],
  team: ["+Snowflake, Redshift, BigQuery", "Includes 3 seats", "5,000+ AI messages/month (scales with seats)"],
  business: ["SSO + governance", "Includes 5 seats", "Unlimited AI messages"],
};

function formatMoney(amount: number, currency: BillingCurrency): string {
  if (currency === "USD") {
    return `$${amount.toLocaleString("en-US")}`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function getDisplayPrice(plan: BillingPlanSlug, currency: BillingCurrency = "INR"): string {
  const amount = PRICES[currency]?.[plan]?.monthly;
  if (!amount) return "";
  const base = `${formatMoney(amount, currency)}/month`;
  const seatPrice = EXTRA_SEAT_PRICE[currency]?.[plan];
  if (seatPrice) {
    return `${base} + ${formatMoney(seatPrice, currency)}/extra seat`;
  }
  return base;
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
  currency: BillingCurrency = "INR",
): Promise<void> {
  const response = await api.post("/billing/subscribe", {
    plan,
    billing_cycle: billingCycle,
    quantity,
    currency,
  });

  const {
    subscription_id: subscriptionId,
    razorpay_key_id: razorpayKeyId,
  } = response.data as {
    subscription_id: string;
    razorpay_key_id: string;
    currency?: BillingCurrency;
  };

  await ensureRazorpayScriptLoaded();
  if (typeof window.Razorpay === "undefined") {
    throw new Error("Razorpay SDK is unavailable. Please refresh and try again.");
  }

  const planLabel = `${plan.charAt(0).toUpperCase() + plan.slice(1)} — ${billingCycle}`;
  const options = {
    key: razorpayKeyId,
    subscription_id: subscriptionId,
    name: "datahub.org.in",
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

export interface SeatUsage {
  current_seats: number;
  included_seats: number;
  purchased_seats: number;
  max_seats: number;
  extra_seat_price_paise: number;
  extra_seat_price_inr: number;
  can_invite_more: boolean;
}

export async function fetchSeatUsage(): Promise<SeatUsage> {
  const response = await api.get("/billing/seat-usage");
  return response.data as SeatUsage;
}

export async function purchaseSeats(quantity: number): Promise<{
  quantity: number;
  changed: boolean;
  previous_quantity?: number;
  effective?: string;
}> {
  const response = await api.post("/billing/seats", { quantity });
  return response.data;
}
