"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /crm 진입 시 — layout 이 bootstrap 으로 onboarding 여부 판별 후 redirect 한다.
 * 여기서는 이중 안전망으로 /crm/dashboard 로 보낸다 (onboarded 인 경우).
 * 미가입이면 layout 이 /crm/onboarding 으로 미리 보낸다.
 */
export default function CrmIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/crm/dashboard");
  }, [router]);
  return null;
}
