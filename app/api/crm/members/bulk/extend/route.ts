import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Target = { table: "crm_memberships" | "crm_passes" | "crm_rentals"; id: number; member_id: number; expires_at: string };

/**
 * POST /api/crm/members/bulk/extend — 선택 회원 일괄 기간 연장
 * body: { member_ids: number[], days: number, reason?: string }
 * 각 회원의 유효(status='valid') 회원권·수강권·대여권 만료일을 days 만큼 연장(홀딩 여부 무관).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  let body: { member_ids?: number[]; days?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberIds = Array.from(
    new Set((body.member_ids ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))
  );
  if (memberIds.length === 0) return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });

  const days = Math.trunc(Number(body.days) || 0);
  if (days === 0) return NextResponse.json({ error: "연장 일수를 입력해 주세요" }, { status: 400 });

  const tables = ["crm_memberships", "crm_passes", "crm_rentals"] as const;
  const targets: Target[] = [];
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("id, member_id, expires_at")
      .eq("center_id", ctx.centerId)
      .in("member_id", memberIds)
      .eq("status", "valid");
    if (error) return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    for (const r of data ?? []) {
      if (!r.expires_at) continue;
      targets.push({ table, id: r.id, member_id: r.member_id, expires_at: r.expires_at });
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, members_affected: 0, items_extended: 0, skipped: memberIds.length });
  }

  for (const table of tables) {
    const rows = targets.filter((t) => t.table === table);
    for (let i = 0; i < rows.length; i += 25) {
      const chunk = rows.slice(i, i + 25);
      await Promise.all(
        chunk.map((t) =>
          supabase
            .from(table)
            .update({ expires_at: addDays(t.expires_at, days) } as never)
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
    action: "members.bulk_extend",
    entity_type: "crm_members",
    entity_id: null,
    payload: {
      member_ids: memberIds,
      members_affected: affected.size,
      items_extended: targets.length,
      days,
      reason: body.reason ?? null,
    } as never,
  });

  return NextResponse.json({
    ok: true,
    members_affected: affected.size,
    items_extended: targets.length,
    skipped: memberIds.length - affected.size,
    days,
  });
}
