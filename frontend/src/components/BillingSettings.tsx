import { useEffect, useMemo, useState } from "react";
import { useBillingRegion } from "../hooks/useIsIndian";
import {
  PLAN_FEATURES,
  cancelSubscription,
  fetchBillingStatus,
  fetchSeatUsage,
  getDisplayPrice,
  getInvoicePdfUrl,
  initiateSubscription,
  listInvoices,
  purchaseSeats,
  INCLUDED_SEATS,
  EXTRA_SEAT_PRICE,
  type BillingPlanSlug,
  type BillingCurrency,
  type SeatUsage,
} from "../services/billing";

const TIER_COLOR: Record<BillingPlanSlug, string> = {
  starter: "#06b6d4",
  professional: "#3b82f6",
  team: "#8b5cf6",
  business: "#eab308",
};

const PLAN_ORDER: BillingPlanSlug[] = ["starter", "professional", "team", "business"];

const canonicalToSlug = (value?: string | null): BillingPlanSlug | null => {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered === "starter") return "starter";
  if (lowered === "professional") return "professional";
  if (lowered === "team") return "team";
  if (lowered === "business") return "business";
  return null;
};

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const formatDateTime = (value?: string | number | null) => {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatAmount = (amountMinor?: number | null, currency: string = "INR") => {
  if (!amountMinor) return "—";
  const cur = (currency || "INR").toUpperCase();
  const major = Math.round(amountMinor / 100);
  if (cur === "USD") {
    return `$${major.toLocaleString("en-US")}`;
  }
  return `₹${major.toLocaleString("en-IN")}`;
};

type BillingState = Awaited<ReturnType<typeof fetchBillingStatus>>;
type Invoice = Awaited<ReturnType<typeof listInvoices>>[number];

export function BillingSettings() {
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [seatUsage, setSeatUsage] = useState<SeatUsage | null>(null);
  const [seatInput, setSeatInput] = useState<number | null>(null);
  const [seatBusy, setSeatBusy] = useState(false);
  const region = useBillingRegion();
  const currency: BillingCurrency = region.currency;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResponse, invoiceResponse] = await Promise.all([
        fetchBillingStatus(),
        listInvoices(),
      ]);
      setBillingState(statusResponse);
      setInvoices(invoiceResponse.slice(0, 12));
      try {
        const seats = await fetchSeatUsage();
        setSeatUsage(seats);
      } catch {
        // seat usage only available for paid plans
      }
    } catch (loadError: unknown) {
      const maybeError = loadError as { response?: { data?: { detail?: string } } };
      setError(maybeError.response?.data?.detail ?? "Failed to load billing information.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const subscription = billingState?.subscription ?? null;
  const currentPlanSlug = useMemo(() => canonicalToSlug(billingState?.plan ?? null), [billingState?.plan]);
  const seatCount = Math.max(Number(subscription?.quantity ?? 1), 1);

  const currentAmountLabel = currentPlanSlug
    ? getDisplayPrice(currentPlanSlug, currency)
    : currency === "USD" ? "Free" : "Free";

  const nextBillingLabel = formatDateTime(subscription?.current_end ?? null);
  const isHalted = String(subscription?.status || "").toLowerCase() === "halted";

  const handleCancel = async () => {
    if (!subscription?.current_end) return;
    const untilDate = formatDateTime(subscription.current_end);
    const confirmCancel = window.confirm(`Your plan stays active until ${untilDate}. Confirm cancellation?`);
    if (!confirmCancel) return;

    try {
      setMessage(null);
      await cancelSubscription(true);
      setMessage(`Subscription will remain active until ${untilDate}.`);
      await load();
    } catch (cancelError: unknown) {
      const maybeError = cancelError as { response?: { data?: { detail?: string } } };
      setError(maybeError.response?.data?.detail ?? "Failed to cancel subscription.");
    }
  };

  const handleSelectPlan = async (plan: BillingPlanSlug) => {
    if (busyPlan) return; // guard against double-click race
    setMessage(null);
    setUpgradeError(null);
    setBusyPlan(plan);
    try {
      await initiateSubscription(plan, "monthly", seatCount, currency);
    } catch (actionError: unknown) {
      const maybeBilling = actionError as { message?: string; code?: string };
      const maybeAxios = actionError as { response?: { data?: { detail?: string } } };
      setUpgradeError(
        maybeBilling.message
        ?? maybeAxios.response?.data?.detail
        ?? "Failed to start checkout. Please try again.",
      );
    } finally {
      setBusyPlan(null);
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    setDownloadingInvoiceId(invoiceId);
    try {
      const url = await getInvoicePdfUrl(invoiceId);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Failed to fetch invoice PDF URL.");
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 16 }}>Billing</h2>
      </div>

      {loading ? <p style={{ color: "var(--tx1)", fontSize: 13 }}>Loading billing details...</p> : null}
      {error ? <p style={{ color: "var(--rd)", fontSize: 13 }}>{error}</p> : null}
      {message ? <p style={{ color: "var(--tx1)", fontSize: 13 }}>{message}</p> : null}
      {upgradeError ? (
        <div
          style={{
            border: "1px solid rgba(239,68,68,0.5)",
            background: "rgba(239,68,68,0.12)",
            borderRadius: 8,
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <p style={{ color: "var(--tx0)", fontSize: 13 }}>{upgradeError}</p>
          <button className="btn" onClick={() => setUpgradeError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {!loading && isHalted ? (
        <div
          style={{
            border: "1px solid rgba(234,179,8,0.6)",
            background: "rgba(234,179,8,0.12)",
            borderRadius: 8,
            padding: 12,
            display: "grid",
            gap: 8,
          }}
        >
          <p style={{ color: "var(--tx0)", fontSize: 13 }}>
            ⚠️ Your last payment failed after 3 attempts. Update your payment method to restore access.
          </p>
          <div>
            <a
              href={subscription?.short_url || "#"}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--ac)", fontSize: 13, fontWeight: 600, pointerEvents: subscription?.short_url ? "auto" : "none", opacity: subscription?.short_url ? 1 : 0.6 }}
            >
              Update payment method →
            </a>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div
          style={{
            border: "1px solid var(--bd2)",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          {currentPlanSlug ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <p style={{ color: "var(--tx0)", fontWeight: 600, display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: TIER_COLOR[currentPlanSlug] }} />
                    {titleCase(currentPlanSlug)} Plan · Monthly · {currentAmountLabel}
                  </p>
                  <p style={{ color: "var(--tx1)", fontSize: 13 }}>
                    Next billing: {nextBillingLabel} · {seatCount} seat{seatCount > 1 ? "s" : ""}
                  </p>
                </div>
                <div style={{ display: "inline-flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowSelector((v) => !v)}
                  >
                    {showSelector ? "Hide Upgrade" : "Upgrade"}
                  </button>
                  <button className="btn" onClick={() => void handleCancel()}>
                    Cancel
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <p style={{ color: "var(--tx0)", fontWeight: 600 }}>You’re on the Free plan.</p>
              <button
                className="btn btn-primary"
                onClick={() => setShowSelector(true)}
              >
                Upgrade
              </button>
            </div>
          )}
        </div>
      ) : null}

      {showSelector ? (
        <div style={{ border: "1px solid var(--bd2)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {PLAN_ORDER.map((plan) => {
              const isCurrent = currentPlanSlug === plan && billingState?.has_active_subscription;
              const canUpgrade = !currentPlanSlug || PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(currentPlanSlug);

              return (
                <article key={plan} style={{ border: `1px solid ${isCurrent ? TIER_COLOR[plan] : "var(--bd2)"}`, borderRadius: 8, padding: 10, display: "grid", gap: 8, position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: 14 }}>{titleCase(plan)}</h3>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: TIER_COLOR[plan] }} />
                  </div>
                  <p className="mono" style={{ color: "var(--tx0)", fontSize: 12 }}>{getDisplayPrice(plan, currency)}</p>
                  <ul style={{ color: "var(--tx1)", display: "grid", gap: 3, paddingLeft: 16, fontSize: 12 }}>
                    {PLAN_FEATURES[plan].map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <button className="btn" disabled>Current plan</button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => void handleSelectPlan(plan)}
                      disabled={Boolean(busyPlan) || !canUpgrade}
                    >
                      {busyPlan === plan ? "Processing..." : `Select ${titleCase(plan)}`}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Seat Management */}
      {seatUsage && currentPlanSlug && (currentPlanSlug === "team" || currentPlanSlug === "business") ? (
        <div id="add-seats" style={{ border: "1px solid var(--bd2)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
          <h3 style={{ fontSize: 14 }}>Seat Management</h3>
          <p style={{ color: "var(--tx1)", fontSize: 13 }}>
            Using {seatUsage.current_seats} of {seatUsage.purchased_seats} seats ({seatUsage.included_seats} included + {seatUsage.purchased_seats - seatUsage.included_seats} extra).
            Max {seatUsage.max_seats} seats.
          </p>
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 13, color: "var(--tx1)" }}>Total seats:</label>
            <input
              type="number"
              min={seatUsage.included_seats}
              max={seatUsage.max_seats}
              value={seatInput ?? seatUsage.purchased_seats}
              onChange={(e) => setSeatInput(Math.max(seatUsage.included_seats, Math.min(seatUsage.max_seats, Number(e.target.value))))}
              style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--bd2)", background: "var(--bg1)", color: "var(--tx0)", fontSize: 13 }}
            />
            <button
              className="btn btn-primary"
              disabled={seatBusy || (seatInput ?? seatUsage.purchased_seats) === seatUsage.purchased_seats}
              onClick={async () => {
                const target = seatInput ?? seatUsage.purchased_seats;
                setSeatBusy(true);
                try {
                  const result = await purchaseSeats(target);
                  setMessage(
                    result.changed
                      ? target > seatUsage.purchased_seats
                        ? `Seats updated to ${result.quantity}. Change effective immediately.`
                        : `Seats will reduce to ${result.quantity} at next renewal.`
                      : "No change."
                  );
                  await load();
                } catch (e: unknown) {
                  const maybeError = e as { response?: { data?: { detail?: string } } };
                  setError(maybeError.response?.data?.detail ?? "Failed to update seats.");
                } finally {
                  setSeatBusy(false);
                  setSeatInput(null);
                }
              }}
            >
              {seatBusy ? "Updating..." : "Update seats"}
            </button>
          </div>
          {EXTRA_SEAT_PRICE[currency]?.[currentPlanSlug] ? (
            <p style={{ color: "var(--tx2)", fontSize: 12 }}>
              Each extra seat: {currency === "USD" ? `$${EXTRA_SEAT_PRICE.USD[currentPlanSlug].toLocaleString("en-US")}` : `₹${EXTRA_SEAT_PRICE.INR[currentPlanSlug].toLocaleString("en-IN")}`}/month.
              Increases apply immediately; decreases take effect at next renewal.
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={{ border: "1px solid var(--bd2)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
        <h3 style={{ fontSize: 14 }}>Payment History</h3>
        {invoices.length === 0 ? (
          <p style={{ color: "var(--tx1)", fontSize: 13 }}>No invoices yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--tx1)", textAlign: "left", borderBottom: "1px solid var(--bd2)" }}>
                  <th style={{ padding: "8px 6px" }}>Date</th>
                  <th style={{ padding: "8px 6px" }}>Description</th>
                  <th style={{ padding: "8px 6px" }}>Amount</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  <th style={{ padding: "8px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const description = invoice.line_items?.[0]?.name || "Subscription charge";
                  const status = (invoice.status || "").toLowerCase();
                  const statusLabel = status === "paid" || status === "captured" ? "✅ Paid" : status ? titleCase(status) : "—";
                  return (
                    <tr key={invoice.id} style={{ borderBottom: "1px solid var(--bd)" }}>
                      <td style={{ padding: "8px 6px", color: "var(--tx1)" }}>{formatDateTime(invoice.date ?? invoice.created_at)}</td>
                      <td style={{ padding: "8px 6px", color: "var(--tx0)" }}>{description}</td>
                      <td style={{ padding: "8px 6px", color: "var(--tx0)" }}>{formatAmount(invoice.amount, (invoice as { currency?: string }).currency)}</td>
                      <td style={{ padding: "8px 6px", color: "var(--tx1)" }}>{statusLabel}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        <button
                          className="btn"
                          onClick={() => void handleDownloadInvoice(invoice.id)}
                          disabled={downloadingInvoiceId === invoice.id}
                        >
                          {downloadingInvoiceId === invoice.id ? "Loading..." : "Download PDF"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
