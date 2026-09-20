import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

// 이름 가운데 별표 마스킹: 홍길동 → 홍*동, 김수 → 김*, 왕 → 왕
function maskName(name: string): string {
  const n = (name ?? "").trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + "*";
  return n[0] + "*".repeat(n.length - 2) + n[n.length - 1];
}

/**
 * GET /api/crm/member-app/attendance-ranking?centerId=
 * 이번 달(KST) 출석 순위 — 회원별 출석한 '일수' 기준. 상위 10 + 내 순위.
 * 이름은 서버에서 가운데 별표 마스킹.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  // 신규 RPC — 생성된 Database 타입에 아직 없어 rpc 호출만 any 캐스트
  const { data, error } = await (supabase as any).rpc("crm_member_attendance_ranking", {
    p_center_id: ctx.centerId,
  });
  if (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  type Row = { rank: number; member_id: number; name: string; days: number };
  const rows = (data ?? []) as Row[];

  const top = rows
    .filter((r) => Number(r.rank) <= 10)
    .map((r) => ({ rank: Number(r.rank), name: maskName(r.name), days: r.days }));

  const mine = rows.find((r) => Number(r.member_id) === ctx.memberId);
  const me = mine ? { rank: Number(mine.rank), days: mine.days } : null;

  return NextResponse.json({ top, me, total: rows.length });
}
