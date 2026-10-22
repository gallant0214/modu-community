import { notFound, redirect } from "next/navigation";
import { legacyPayRedirect } from "@/app/lib/pay-path";

export const dynamic = "force-dynamic";

/**
 * 옛 결제 주소 호환 — `/pay/[orderUid]` → `/store/[센터슬러그]/pay/[orderUid]`.
 *
 * 🚨 경로를 바꾸는 순간 **이미 발급된 결제 링크가 전부 깨진다**:
 *    · 주문만 만들어두고 아직 결제창을 안 연 회원 (주문 토큰 35분 유효)
 *    · 문자로 보낸 결제 링크
 *    · 이미 설치된 회원앱이 들고 있던 주소
 *    그래서 옛 경로를 지우지 않고 **쿼리를 그대로 달고** 새 주소로 넘긴다.
 *
 * 영구(308)가 아니라 **임시(307)** 다 — 나중에 또 옮길 여지를 남긴다.
 * (redirect() 는 기본이 307이다)
 */
export default async function LegacyPayRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ orderUid: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orderUid } = await params;
  const sp = await searchParams;

  const target = await legacyPayRedirect(orderUid);
  if (!target) notFound();

  const qs = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v != null) as [string, string][]
  ).toString();
  redirect(qs ? `${target}?${qs}` : target);
}
