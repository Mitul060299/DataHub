import { useEffect, useState } from "react";

/**
 * Returns true if the user's timezone is Indian Standard Time (Asia/Kolkata or
 * Asia/Calcutta). Defaults to true to avoid a flash of "Coming Soon" badges
 * for Indian users during the brief window before useEffect fires.
 */
export function useIsIndian(): boolean {
  const [isIndian, setIsIndian] = useState(true);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setIsIndian(tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta"));
  }, []);

  return isIndian;
}
