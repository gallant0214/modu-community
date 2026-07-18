import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / (24 * 3600 * 1000));

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Target = { table: "crm_memberships" | "crm_passes" | "crm_rentals"; id: number; member_id: number; expires_at: string };

/**
 * POST /api/crm/members/bulk/hold — 선택 회원 일괄 홀딩
 * body: { member_ids: number[], start_date, end_date, reason?, requested_by? }
 * 각 회원의 유효(status='valid')하고 홀딩중이 아닌 회원권·수강권·대여권 전부에 대해
 * crm_pauses 기록 + 만료일 연장(end-start+1일) + is_paused=true.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  let body: { member_ids?: number[]; start_date?: string; end_date?: string; reason?: string; requested_by?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberIds = Array.from(
    new Set((body.member_ids ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))
  );
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });
  }
  const start = body.start_date;
  const end = body.end_date;
  if (!start || !end) return NextResponse.json({ error: "시작일과 종료일을 입력해 주세요" }, { status: 400 });
  if (end < start) return NextResponse.json({ error: "종료일이 시작일보다 빠를 수 없어요" }, { status: 400 });
  const days = dayDiff(start, end) + 1; // inclusive

  // 세 테이블에서 유효·미홀딩 이용권 수집
  const tables = ["crm_memberships", "crm_passes", "crm_rentals"] as const;
  const targets: Target[] = [];
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("id, member_id, expires_at")
      .eq("center_id", ctx.centerId)
      .in("member_id", memberIds)
      .eq("status", "valid")
      .eq("is_paused", false);
    if (error) {
      return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    }
    for (const r of data ?? []) {
      if (!r.expires_at) continue;
      targets.push({ table, id: r.id, member_id: r.member_id, expires_at: r.expires_at });
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, members_affected: 0, items_held: 0, skipped: memberIds.length });
  }

  // 홀딩 기록 일괄 insert
  const pauseRows = targets.map((t) => ({
    center_id: ctx.centerId,
    member_id: t.member_id,
    pass_id: t.table === "crm_passes" ? t.id : null,
    membership_id: t.table === "crm_memberships" ? t.id : null,
    rental_id: t.table === "crm_rentals" ? t.id : null,
    start_date: start,
    end_date: end,
    reason: body.reason?.trim() || null,
    requested_by: body.requested_by?.trim() || null,
    status: "active",
    extended_days: days,
    created_by_uid: ctx.uid,
  }));
  const { error: pErr } = await supabase.from("crm_pauses").insert(pauseRows as never);
  if (pErr) {
    return NextResponse.json({ error: "홀딩 기록 실패", detail: pErr.message }, { status: 500 });
  }

  // 각 이용권 만료일 연장 + is_paused (테이블별 병렬, 25건씩 청크)
  for (const table of tables) {
    const rows = targets.filter((t) => t.table === table);
    for (let i = 0; i < rows.length; i += 25) {
      const chunk = rows.slice(i, i + 25);
      await Promise.all(
        chunk.map((t) =>
          supabase
            .from(table)
            .update({ expires_at: addDays(t.expires_at, days), is_paused: true } as never)
            .eq("id", t.id)
            .eq("center_id", ctx.centerId)
        )
      );
    }
  }

  const affected = new Set(targets.map((t) => t.member_id));
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "members.bulk_hold",
    entity_type: "crm_members",
    entity_id: null,
    payload: {
      member_ids: memberIds,
      members_affected: affected.size,
      items_held: targets.length,
      start,
      end,
      days,
      reason: body.reason ?? null,
      requested_by: body.requested_by ?? null,
    } as never,
  });

  return NextResponse.json({
    ok: true,
    members_affected: affected.size,
    items_held: targets.length,
    skipped: memberIds.length - affected.size,
    extended_days: days,
  });
}
