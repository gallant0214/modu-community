import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { isSubscriptionLive } from "@/app/lib/saas-subscription";

export const dynamic = "force-dynamic";

/**
 * GET /api/saas/subscriptions — 내가 대표자인 센터들의 **실제 구독 상태**.
 *
 * 🚨 `crmAccessState()` 를 쓰면 안 된다. 그건 "지금 CRM 에 들어갈 수 있는가" 를
 *    답하는 함수라, 구독 강제가 꺼져 있으면(= 전원 무료 롤아웃 중) 구독이 아예 없어도
 *    `allowed: true, expiresOn: null` 을 돌려준다.
 *    결제 화면이 그걸 그대로 쓰면 **"무료 이용 중"** 으로 표시되는데,
 *    PG 심사원이 보면 유료 상품 페이지에서 "0원 상품" 으로 읽힌다.
 *    여기서는 접근 권한과 무관하게 **구독 행 자체**를 본다.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 내가 대표자인 센터만 — 결제할 수 있는 사람의 센터만 보여준다
  const { data: memRows } = await supabase
    .from("crm_center_members")
    .select("center_id, role, is_solo_owner")
    .eq("firebase_uid", user.uid)
    .eq("status", "active");
  const centerIds = ((memRows ?? []) as { center_id: number; role: string; is_solo_owner: boolean }[])
    .filter((m) => m.role === "owner" || m.is_solo_owner)
    .map((m) => m.center_id);

  if (centerIds.length === 0) return NextResponse.json({ subscriptions: [] });

  const { data } = await supabase
    .from("saas_subscriptions")
    .select("center_id, status, started_on, expires_on")
    .in("center_id", centerIds)
    .eq("status", "active");

  const rows = (data ?? []) as {
    center_id: number;
    status: string;
    started_on: string;
    expires_on: string;
  }[];

  return NextResponse.json({
    subscriptions: rows.map((s) => ({
      centerId: s.center_id,
      startedOn: s.started_on,
      expiresOn: s.expires_on,
      /** 오늘(KST) 기준 유효 여부 — 만료일 당일까지 포함 */
      live: isSubscriptionLive(s),
    })),
  });
}
