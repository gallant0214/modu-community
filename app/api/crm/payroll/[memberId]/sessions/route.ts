import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/payroll/[memberId]/sessions?period=this_month
 * 강사(trainer_member_id=memberId) 의 수강권 발급 내역(개인·그룹 통합).
 * 회당 수업료는 부가세 제외 실수업료(price_won VAT 제외 ÷ 총 세션).
 */
function periodRange(period: string): { start: string; endExcl: string } {
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  if (period === "last_month") {
    return { start: ymd(new Date(Date.UTC(y, m - 1, 1))), endExcl: ymd(new Date(Date.UTC(y, m, 1))) };
  }
  if (period === "this_year") {
    return { start: `${y}-01-01`, endExcl: `${y + 1}-01-01` };
  }
  // this_month (기본)
  return { start: ymd(new Date(Date.UTC(y, m, 1))), endExcl: ymd(new Date(Date.UTC(y, m + 1, 1))) };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { memberId } = await params;
  const trainerId = Number(memberId);
  if (!trainerId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const url = new URL(request.url);
  const { start, endExcl } = periodRange(url.searchParams.get("period") || "this_month");

  const { data: passes, error } = await supabase
    .from("crm_passes")
    .select("id, member_id, lesson_kind, issue_type, total_sessions, remaining_sessions, price_won, vat_included, issued_at, status")
    .eq("center_id", ctx.centerId)
    .eq("trainer_member_id", trainerId)
    .neq("status", "deleted")
    .gte("issued_at", start)
    .lt("issued_at", endExcl);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const rows = (passes ?? []) as {
    id: number;
    member_id: number;
    lesson_kind: string | null;
    issue_type: string | null;
    total_sessions: number | null;
    remaining_sessions: number | null;
    price_won: number | null;
    vat_included: boolean | null;
    issued_at: string | null;
  }[];

  const memberIds = Array.from(new Set(rows.map((p) => p.member_id)));
  const memberMap = new Map<number, { name: string; birth: string | null; gender: string | null; phone: string | null }>();
  if (memberIds.length) {
    const { data: mem } = await supabase
      .from("crm_members")
      .select("id, name, birth, gender, phone")
      .in("id", memberIds);
    for (const m of (mem ?? []) as { id: number; name: string; birth: string | null; gender: string | null; phone: string | null }[]) {
      memberMap.set(m.id, { name: m.name, birth: m.birth, gender: m.gender, phone: m.phone });
    }
  }

  const kstYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  const ageOf = (birth: string | null): number | null => {
    if (!birth || birth.length < 4) return null;
    const y = Number(birth.slice(0, 4));
    return y ? kstYear - y : null;
  };

  const items = rows
    .map((p) => {
      const mem = memberMap.get(p.member_id);
      const total = p.total_sessions ?? 0;
      const remaining = p.remaining_sessions ?? 0;
      const used = Math.max(0, total - remaining);
      const price = p.price_won ?? 0;
      // 실수업료(부가세 제외)
      const vatExcluded = p.vat_included ? Math.round(price / 1.1) : price;
      const perSession = total > 0 ? Math.round(vatExcluded / total) : 0;
      return {
        id: p.id,
        member_name: mem?.name ?? "-",
        age: ageOf(mem?.birth ?? null),
        gender: mem?.gender ?? null,
        phone: mem?.phone ?? null,
        product: p.lesson_kind || "-",
        total,
        used,
        remaining,
        per_session_won: perSession,
        issued_at: p.issued_at,
      };
    })
    .sort((a, b) => ((a.issued_at ?? "") < (b.issued_at ?? "") ? 1 : -1));

  return NextResponse.json({
    sessions: items,
    total_count: items.length,
    total_sessions: items.reduce((s, x) => s + x.total, 0),
  });
}
