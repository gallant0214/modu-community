import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/dashboard/attendance-ranking
 * 이번 달(KST) 출석 순위 — 회원별 출석한 '일수' 기준. CRM 대시보드용.
 * 회원앱과 같은 RPC(crm_member_attendance_ranking)를 쓰되,
 * CRM(운영자) 화면이라 이름을 마스킹하지 않고 전체를 그대로 내려준다.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // 신규 RPC — 생성된 Database 타입에 없어 rpc 호출만 any 캐스트
  const { data, error } = await (supabase as any).rpc("crm_member_attendance_ranking", {
    p_center_id: ctx.centerId,
  });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  type Row = { rank: number; member_id: number; name: string; days: number };
  const rows = (data ?? []) as Row[];

  // 전체 순위, 실명 그대로 (마스킹 없음)
  const ranking = rows
    .map((r) => ({ rank: Number(r.rank), member_id: Number(r.member_id), name: r.name, days: Number(r.days) }))
    .sort((a, b) => a.rank - b.rank);

  return NextResponse.json({ ranking, total: ranking.length });
}
