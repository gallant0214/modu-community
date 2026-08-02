import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/reservations?centerId=&from=&to=
 * 내 예약 목록. 기본: 오늘 0시(KST)부터 앞으로. from/to 지정 시 해당 구간.
 * 트레이너명·수강권명·회차(session_index/total) 포함.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabase
    .from("crm_reservations")
    .select("id, pass_id, trainer_member_id, starts_at, ends_at, status, source, cancelled_reason, rejected_reason")
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId);

  if (from || to) {
    const f = from || new Date().toISOString().slice(0, 10);
    const t = to || f;
    const startUtc = new Date(`${f}T00:00:00+09:00`);
    const endUtc = new Date(new Date(`${t}T00:00:00+09:00`).getTime() + 24 * 3600 * 1000);
    query = query
      .gte("starts_at", startUtc.toISOString())
      .lt("starts_at", endUtc.toISOString())
      .order("starts_at", { ascending: false });
  } else {
    const todayKst = new Date().toISOString().slice(0, 10);
    query = query.gte("starts_at", new Date(`${todayKst}T00:00:00+09:00`).toISOString()).order("starts_at", { ascending: true });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const list = data ?? [];

  // 트레이너 이름
  const trainerIds = Array.from(new Set(list.map((r) => r.trainer_member_id)));
  const trainerMap = new Map<number, string>();
  if (trainerIds.length) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const s of staff ?? []) trainerMap.set(s.id, s.display_name || "트레이너");
  }

  // 수강권명 + 회차 계산
  const passIds = Array.from(new Set(list.map((r) => r.pass_id).filter((v): v is number => !!v)));
  const passKind = new Map<number, string>();
  const passTotal = new Map<number, number>();
  const sessionIndex = new Map<number, number>(); // reservation id -> 회차
  if (passIds.length) {
    const [{ data: passes }, { data: allRes }] = await Promise.all([
      supabase.from("crm_passes").select("id, lesson_kind, total_sessions").in("id", passIds),
      supabase
        .from("crm_reservations")
        .select("id, pass_id, starts_at, status")
        .eq("center_id", ctx.centerId)
        .in("pass_id", passIds)
        .not("status", "in", "(cancelled,rejected)")
        .order("starts_at", { ascending: true }),
    ]);
    for (const p of passes ?? []) {
      passKind.set(p.id, p.lesson_kind);
      passTotal.set(p.id, p.total_sessions ?? 0);
    }
    const counter = new Map<number, number>();
    for (const r of allRes ?? []) {
      if (!r.pass_id) continue;
      const n = (counter.get(r.pass_id) ?? 0) + 1;
      counter.set(r.pass_id, n);
      sessionIndex.set(r.id, n);
    }
  }

  return NextResponse.json({
    reservations: list.map((r) => ({
      id: r.id,
      passId: r.pass_id,
      lessonKind: r.pass_id ? passKind.get(r.pass_id) ?? "" : "",
      trainerId: r.trainer_member_id,
      trainerName: trainerMap.get(r.trainer_member_id) ?? "트레이너",
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.status,
      source: r.source,
      sessionIndex: r.pass_id ? sessionIndex.get(r.id) ?? null : null,
      sessionTotal: r.pass_id ? passTotal.get(r.pass_id) ?? null : null,
      cancelledReason: r.cancelled_reason,
      rejectedReason: r.rejected_reason,
    })),
  });
}
