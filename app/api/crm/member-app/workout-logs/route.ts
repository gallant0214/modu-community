import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/workout-logs?centerId=
 * 트레이너가 남긴 '회원공유기록'(log_type='shared')을 회원에게 노출.
 *  - 강사 내부 메모(log_type='trainer')는 제외.
 *  - created_by_uid → 강사 표시이름(crm_center_members.display_name) 매핑.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data: logs, error } = await supabase
    .from("crm_member_workout_logs")
    .select("id, log_date, memo, created_by_uid, created_at")
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .eq("log_type", "shared")
    .order("log_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }

  // 강사 uid → 이름
  const uids = Array.from(new Set((logs ?? []).map((l) => l.created_by_uid).filter(Boolean)));
  const nameByUid = new Map<string, string>();
  if (uids.length) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("firebase_uid, display_name")
      .eq("center_id", ctx.centerId)
      .in("firebase_uid", uids as string[]);
    for (const s of staff ?? []) if (s.firebase_uid) nameByUid.set(s.firebase_uid, s.display_name);
  }

  return NextResponse.json({
    logs: (logs ?? []).map((l) => ({
      id: l.id,
      logDate: l.log_date,
      memo: l.memo,
      trainerName: l.created_by_uid ? nameByUid.get(l.created_by_uid) ?? null : null,
      createdAt: l.created_at,
    })),
  });
}
