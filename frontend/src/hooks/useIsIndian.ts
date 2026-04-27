import { useEffect, useState } from "react";

export type BillingRegion = {
  isIndian: boolean;
  currency: "INR" | "USD";
};

/**
 * Returns the user's billing region inferred from their browser timezone.
 *
 * Indian users (Asia/Kolkata or Asia/Calcutta) are billed in INR via the
 * Razorpay domestic flow. Everyone else is billed in USD via the Razorpay
 * International flow on the same merchant account.
 *
 * Defaults to ``isIndian: true`` to avoid a flash of foreign-currency
 * pricing for Indian users during the brief window before useEffect runs.
 */
export function useBillingRegion(): BillingRegion {
  const [region, setRegion] = useState<BillingRegion>({
    isIndian: true,
    currency: "INR",
  });

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const isIndian =
      tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta");
    setRegion({
      isIndian,
      currency: isIndian ? "INR" : "USD",
    });
  }, []);

  return region;
}

/** Back-compat: existing call sites using ``useIsIndian()`` keep working. */
export function useIsIndian(): boolean {
  return useBillingRegion().isIndian;
}
