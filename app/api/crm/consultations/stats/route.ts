import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/consultations/stats?from=&to=
 * 담당 강사별 상담·전환·전환률 집계.
 * owner/admin/solo owner 만 전체 접근. trainer/manager 는 본인 데이터만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabase
    .from("crm_pt_consultations")
    .select("trainer_member_id, status")
    .eq("center_id", ctx.centerId);
  if (from) query = query.gte("consulted_at", from);
  if (to) query = query.lte("consulted_at", to);

  const isRestricted = (ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner;
  if (isRestricted) query = query.eq("trainer_member_id", ctx.centerMemberId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  type Bucket = { trainer_member_id: number | null; total: number; converted: number; lost: number; open: number };
  const bucket = new Map<number, Bucket>();
  for (const r of data ?? []) {
    const key = r.trainer_member_id ?? 0;
    if (!bucket.has(key)) {
      bucket.set(key, { trainer_member_id: r.trainer_member_id, total: 0, converted: 0, lost: 0, open: 0 });
    }
    const b = bucket.get(key)!;
    b.total += 1;
    if (r.status === "converted") b.converted += 1;
    else if (r.status === "lost") b.lost += 1;
    else b.open += 1;
  }

  const trainerIds = Array.from(bucket.keys()).filter((id) => id > 0);
  const nameMap = new Map<number, string>();
  if (trainerIds.length) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const s of staff ?? []) nameMap.set(s.id, s.display_name);
  }

  const totalAll = { total: 0, converted: 0, lost: 0, open: 0 };
  for (const b of bucket.values()) {
    totalAll.total += b.total;
    totalAll.converted += b.converted;
    totalAll.lost += b.lost;
    totalAll.open += b.open;
  }

  const trainerStats = Array.from(bucket.values())
    .map((b) => ({
      trainer_member_id: b.trainer_member_id,
      trainer_name: b.trainer_member_id ? nameMap.get(b.trainer_member_id) ?? "미지정" : "미지정",
      total: b.total,
      converted: b.converted,
      lost: b.lost,
      open: b.open,
      conversion_rate:
        b.total > 0 ? Math.round(((b.converted / b.total) * 100) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    total: totalAll,
    conversion_rate:
      totalAll.total > 0 ? Math.round(((totalAll.converted / totalAll.total) * 100) * 10) / 10 : 0,
    by_trainer: trainerStats,
  });
}
