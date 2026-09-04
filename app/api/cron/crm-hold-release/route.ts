import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/crm-hold-release — 매일 실행(vercel.json).
 *
 * 홀딩(crm_pauses) 종료일(end_date)이 지난 진행 중(active) 홀딩을 자동 해제한다.
 *  - 이용권 is_paused=false 로 복구 (만료일은 홀딩 시점에 이미 연장돼 있으므로 되돌리지 않음)
 *  - 홀딩 기록 status='ended' 로 마감
 * 조기 해제(cancelled, 연장분 원복)와 구분된다.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  let released = 0;
  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  // 종료일이 지난 active 홀딩 (end_date < 오늘 KST). 페이지네이션.
  for (let page = 0; page < 100; page++) {
    const { data: pauses, error } = await supabase
      .from("crm_pauses")
      .select("id, pass_id, membership_id, rental_id, center_id")
      .eq("status", "active")
      .lt("end_date", todayKst)
      .order("id", { ascending: true })
      .range(page * 500, page * 500 + 499);
    if (error) {
      errors.push(`query: ${error.message}`);
      break;
    }
    if (!pauses || pauses.length === 0) break;

    for (const p of pauses as {
      id: number;
      pass_id: number | null;
      membership_id: number | null;
      rental_id: number | null;
      center_id: number;
    }[]) {
      const table = p.pass_id ? "crm_passes" : p.membership_id ? "crm_memberships" : "crm_rentals";
      const targetId = p.pass_id ?? p.membership_id ?? p.rental_id;
      if (!targetId) continue;
      try {
        // 만료일은 그대로(연장 유지), 일시정지만 해제
        await supabase
          .from(table)
          .update({ is_paused: false } as never)
          .eq("id", targetId)
          .eq("center_id", p.center_id);
        await supabase
          .from("crm_pauses")
          .update({ status: "ended", cancelled_at: nowIso } as never)
          .eq("id", p.id);
        released++;
      } catch (e) {
        errors.push(`pause#${p.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    if (pauses.length < 500) break;
  }

  return NextResponse.json({ ok: true, today: todayKst, released, errors: errors.slice(0, 20) });
}
