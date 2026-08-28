import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

async function paginateAll<T>(
  build: (from: number, to: number) => { then: (fn: (r: unknown) => void) => unknown },
  chunk = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const to = from + chunk - 1;
    const res = (await build(from, to)) as { data: T[] | null; error: unknown };
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}

/**
 * GET /api/crm/stats/trainer-revenue
 * 최근 12개월 강사별 월별 매출(담당강사 배정 PT 수강권 발급액, issued_at 기준 KST).
 * 강사 매출 표('매출(원)' 열)와 동일 기준: crm_passes.trainer_member_id × price_won.
 * 응답: { months: ["2026-01"...], trainers: [{ id, name, role, monthly: number[], total }] }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const months: { ym: string; start: string; endExcl: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    months.push({
      ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      start: d.toISOString().slice(0, 10),
      endExcl: next.toISOString().slice(0, 10),
    });
  }
  const windowStart = months[0].start;
  const windowEndExcl = months[11].endExcl;
  const monthIndex = (ymd: string) =>
    months.findIndex((mm) => ymd >= mm.start && ymd < mm.endExcl);

  try {
    // 강사 후보 = 재직 중 수업 관련 등급(owner/admin/manager/trainer)
    let staffQuery = supabase
      .from("crm_center_members")
      .select("id, display_name, role")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .in("role", ["owner", "admin", "manager", "trainer"]);
    // 데이터 격리: trainer/manager 는 본인만
    if (ctx.role === "trainer" || ctx.role === "manager") {
      staffQuery = staffQuery.eq("id", ctx.centerMemberId ?? -1);
    }
    const { data: staff, error: staffErr } = await staffQuery;
    if (staffErr) {
      return NextResponse.json({ error: "조회 실패", detail: staffErr.message }, { status: 500 });
    }

    // 담당강사 배정 수강권 (issued_at 기준). 매출 = price_won 합.
    const passBuilder = (f: number, t: number) => {
      let q = supabase
        .from("crm_passes")
        .select("trainer_member_id, price_won, issued_at")
        .eq("center_id", ctx.centerId)
        .not("trainer_member_id", "is", null)
        .gte("issued_at", `${windowStart}T00:00:00+09:00`)
        .lt("issued_at", `${windowEndExcl}T00:00:00+09:00`)
        .range(f, t);
      if (ctx.role === "trainer" || ctx.role === "manager") {
        q = q.eq("trainer_member_id", ctx.centerMemberId ?? -1);
      }
      return q;
    };
    const passes = await paginateAll<{
      trainer_member_id: number | null;
      price_won: number | null;
      issued_at: string | null;
    }>((f, t) => passBuilder(f, t));

    // trainer_id -> monthly revenue
    const monthlyByTrainer = new Map<number, number[]>();
    const ensure = (id: number) => {
      if (!monthlyByTrainer.has(id)) monthlyByTrainer.set(id, months.map(() => 0));
      return monthlyByTrainer.get(id)!;
    };
    for (const p of passes) {
      if (!p.trainer_member_id || !p.issued_at) continue;
      const kst = new Date(new Date(p.issued_at).getTime() + 9 * 3600 * 1000);
      const idx = monthIndex(kst.toISOString().slice(0, 10));
      if (idx < 0) continue;
      ensure(p.trainer_member_id)[idx] += p.price_won ?? 0;
    }

    // 이름 매핑 (staff + 발급에만 있는 강사)
    const nameMap = new Map<number, { name: string; role: string }>();
    for (const s of staff ?? []) nameMap.set(s.id, { name: s.display_name, role: s.role });
    const missing = Array.from(monthlyByTrainer.keys()).filter((id) => !nameMap.has(id));
    if (missing.length > 0) {
      const { data: extra } = await supabase
        .from("crm_center_members")
        .select("id, display_name, role")
        .eq("center_id", ctx.centerId)
        .in("id", missing);
      for (const s of extra ?? []) nameMap.set(s.id, { name: s.display_name, role: s.role });
    }

    const idSet = new Set<number>([...nameMap.keys()]);
    const trainers = Array.from(idSet)
      .map((id) => {
        const monthly = monthlyByTrainer.get(id) ?? months.map(() => 0);
        const total = monthly.reduce((s, v) => s + v, 0);
        const meta = nameMap.get(id);
        return { id, name: meta?.name ?? `#${id}`, role: meta?.role ?? "", monthly, total };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ko"));

    return NextResponse.json({ months: months.map((m) => m.ym), trainers });
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
