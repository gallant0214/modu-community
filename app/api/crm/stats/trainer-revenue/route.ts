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
 * 최근 12개월 강사별 월별 매출 — 항목(회원권/수강권/기타)별로 나눠 반환.
 *
 * 귀속 기준 (항목마다 다름):
 *  - 수강권(pass)       : crm_passes.trainer_member_id (담당강사) × price_won, issued_at
 *                         → 강사 매출 표의 '매출(원)' 열과 동일 기준
 *  - 회원권(membership) : crm_memberships.seller_member_id (판매 직원) × price_won,
 *                         purchased_at(없으면 start_date)
 *  - 기타(etc)          : crm_rentals(운동복·락커) seller_member_id × price_won, start_date
 * ⚠️ 회원권·기타는 판매 직원이 지정된 건만 집계된다(미지정 건은 귀속 불가).
 *
 * 응답: { months, trainers: [{ id, name, role, monthly, total,
 *         monthly_by_type: { membership, pass, etc }, total_by_type: {...} }] }
 * 화면에서 체크한 항목만 합산해 표시한다.
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

    const isScoped = ctx.role === "trainer" || ctx.role === "manager";
    const meId = ctx.centerMemberId ?? -1;

    // 담당강사 배정 수강권 (issued_at 기준). 매출 = price_won 합.
    const passBuilder = (f: number, t: number) => {
      let q = supabase
        .from("crm_passes")
        .select("trainer_member_id, price_won, issued_at")
        .eq("center_id", ctx.centerId)
        .not("trainer_member_id", "is", null)
        .gte("issued_at", windowStart)
        .lt("issued_at", windowEndExcl)
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

    // 회원권 — 판매 직원(seller_member_id) 귀속. 결제일(purchased_at) 없으면 시작일.
    const membershipBuilder = (f: number, t: number) => {
      let q = supabase
        .from("crm_memberships")
        .select("seller_member_id, price_won, purchased_at, start_date")
        .eq("center_id", ctx.centerId)
        .not("seller_member_id", "is", null)
        .or(
          `and(purchased_at.gte.${windowStart},purchased_at.lt.${windowEndExcl}),` +
            `and(purchased_at.is.null,start_date.gte.${windowStart},start_date.lt.${windowEndExcl})`
        )
        .range(f, t);
      if (isScoped) q = q.eq("seller_member_id", meId);
      return q;
    };
    const memberships = await paginateAll<{
      seller_member_id: number | null;
      price_won: number | null;
      purchased_at: string | null;
      start_date: string | null;
    }>((f, t) => membershipBuilder(f, t));

    // 기타 — 운동복·락커 등 대여권. 판매 직원 귀속, 시작일 기준.
    const rentalBuilder = (f: number, t: number) => {
      let q = supabase
        .from("crm_rentals")
        .select("seller_member_id, price_won, start_date")
        .eq("center_id", ctx.centerId)
        .not("seller_member_id", "is", null)
        .gte("start_date", windowStart)
        .lt("start_date", windowEndExcl)
        .range(f, t);
      if (isScoped) q = q.eq("seller_member_id", meId);
      return q;
    };
    const rentals = await paginateAll<{
      seller_member_id: number | null;
      price_won: number | null;
      start_date: string | null;
    }>((f, t) => rentalBuilder(f, t));

    // trainer_id -> 항목별 월 매출
    type ByType = { membership: number[]; pass: number[]; etc: number[] };
    const byTrainer = new Map<number, ByType>();
    const ensure = (id: number): ByType => {
      if (!byTrainer.has(id)) {
        byTrainer.set(id, {
          membership: months.map(() => 0),
          pass: months.map(() => 0),
          etc: months.map(() => 0),
        });
      }
      return byTrainer.get(id)!;
    };
    // 세 테이블 모두 date 컬럼(YYYY-MM-DD)이라 그대로 월 인덱스로 매핑한다.
    const idxOf = (v: string) => monthIndex(v.slice(0, 10));

    for (const p of passes) {
      if (!p.trainer_member_id || !p.issued_at) continue;
      const idx = idxOf(p.issued_at);
      if (idx < 0) continue;
      ensure(p.trainer_member_id).pass[idx] += p.price_won ?? 0;
    }
    for (const m of memberships) {
      const when = m.purchased_at ?? m.start_date;
      if (!m.seller_member_id || !when) continue;
      const idx = idxOf(when);
      if (idx < 0) continue;
      ensure(m.seller_member_id).membership[idx] += m.price_won ?? 0;
    }
    for (const r of rentals) {
      if (!r.seller_member_id || !r.start_date) continue;
      const idx = idxOf(r.start_date);
      if (idx < 0) continue;
      ensure(r.seller_member_id).etc[idx] += r.price_won ?? 0;
    }

    // 이름 매핑 (staff + 발급에만 있는 강사)
    const nameMap = new Map<number, { name: string; role: string }>();
    for (const s of staff ?? []) nameMap.set(s.id, { name: s.display_name, role: s.role });
    const missing = Array.from(byTrainer.keys()).filter((id) => !nameMap.has(id));
    if (missing.length > 0) {
      const { data: extra } = await supabase
        .from("crm_center_members")
        .select("id, display_name, role")
        .eq("center_id", ctx.centerId)
        .in("id", missing);
      for (const s of extra ?? []) nameMap.set(s.id, { name: s.display_name, role: s.role });
    }

    const idSet = new Set<number>([...nameMap.keys()]);
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
    const trainers = Array.from(idSet)
      .map((id) => {
        const bt =
          byTrainer.get(id) ?? {
            membership: months.map(() => 0),
            pass: months.map(() => 0),
            etc: months.map(() => 0),
          };
        const monthly = months.map((_, i) => bt.membership[i] + bt.pass[i] + bt.etc[i]);
        const total = sum(monthly);
        const meta = nameMap.get(id);
        return {
          id,
          name: meta?.name ?? `#${id}`,
          role: meta?.role ?? "",
          monthly,
          total,
          monthly_by_type: bt,
          total_by_type: {
            membership: sum(bt.membership),
            pass: sum(bt.pass),
            etc: sum(bt.etc),
          },
        };
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
