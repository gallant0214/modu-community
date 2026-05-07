"use client";

import { useTabAnalytics } from "@/app/lib/use-tab-analytics";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  useTabAnalytics("jobs");
  return <>{children}</>;
}
