"use client";

import { useTabAnalytics } from "@/app/lib/use-tab-analytics";

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  useTabAnalytics("community");
  return <>{children}</>;
}
