"use client";

import { useTabAnalytics } from "@/app/lib/use-tab-analytics";

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  useTabAnalytics("trade");
  return <>{children}</>;
}
