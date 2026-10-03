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
 *
 * 🚨 '고아 홀딩' 도 함께 정리한다 (2026-10-03 추가).
 *    BROJ 이관분처럼 crm_pauses 기록 없이 is_paused 플래그만 켜진 건은 종료일을 알 수 없어
 *    영원히 홀딩으로 남았다(김민규 회원 사례: 목록은 '홀딩', 상세엔 칩 없음, 출석 안내도 비정상).
 *    근거 기록이 없으면 홀딩으로 볼 수 없으므로 해제하고 감사로그를 남긴다.
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
        await supabase.from("crm_audit_logs").insert({
          center_id: p.center_id,
          actor_uid: "system:cron",
          action: "pause.ended",
          entity_type: "crm_pauses",
          entity_id: p.id,
          payload: { kind: p.pass_id ? "pass" : p.membership_id ? "membership" : "rental", target_id: targetId } as never,
        });
        released++;
      } catch (e) {
        errors.push(`pause#${p.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    if (pauses.length < 500) break;
  }

  // ── 고아 홀딩 정리: 활성 홀딩 기록이 없는데 is_paused 만 켜진 상품 ──
  const { data: activePauses } = await supabase
    .from("crm_pauses")
    .select("pass_id, membership_id, rental_id")
    .eq("status", "active");
  const activeIds = {
    pass: new Set<number>(),
    membership: new Set<number>(),
    rental: new Set<number>(),
  };
  for (const p of (activePauses ?? []) as { pass_id: number | null; membership_id: number | null; rental_id: number | null }[]) {
    if (p.pass_id) activeIds.pass.add(p.pass_id);
    if (p.membership_id) activeIds.membership.add(p.membership_id);
    if (p.rental_id) activeIds.rental.add(p.rental_id);
  }

  let orphansReleased = 0;
  for (const [kind, table] of [
    ["pass", "crm_passes"],
    ["membership", "crm_memberships"],
    ["rental", "crm_rentals"],
  ] as const) {
    const { data: paused } = await supabase
      .from(table)
      .select("id, center_id")
      .eq("is_paused", true)
      .limit(2000);
    for (const row of (paused ?? []) as { id: number; center_id: number }[]) {
      if (activeIds[kind].has(row.id)) continue; // 정상 홀딩 중
      try {
        await supabase.from(table).update({ is_paused: false } as never).eq("id", row.id);
        await supabase.from("crm_audit_logs").insert({
          center_id: row.center_id,
          actor_uid: "system:cron",
          action: "pause.orphan_release",
          entity_type: table,
          entity_id: row.id,
          payload: { kind, reason: "홀딩 기록 없이 일시정지 플래그만 남아 있어 해제" } as never,
        });
        orphansReleased++;
      } catch (e) {
        errors.push(`${kind}#${row.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    today: todayKst,
    released,
    orphans_released: orphansReleased,
    errors: errors.slice(0, 20),
  });
}
