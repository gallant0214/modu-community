"use client";

import { useTabAnalytics } from "@/app/lib/use-tab-analytics";

export default function PracticalLayout({ children }: { children: React.ReactNode }) {
  useTabAnalytics("practical");
  return <>{children}</>;
}
