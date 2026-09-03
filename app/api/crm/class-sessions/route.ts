import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/class-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 클래스 수업 세션 목록(예약 인원수 포함).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = supabase
    .from("crm_class_sessions")
    .select("id, product_id, trainer_member_id, title, starts_at, ends_at, capacity, status")
    .eq("center_id", ctx.centerId)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (from) q = q.gte("starts_at", `${from}T00:00:00+09:00`);
  if (to) {
    const n = new Date(`${to}T00:00:00+09:00`);
    n.setUTCDate(n.getUTCDate() + 1);
    q = q.lt("starts_at", n.toISOString());
  }
  const { data: sessions, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const ids = (sessions ?? []).map((s) => s.id);
  const productIds = Array.from(new Set((sessions ?? []).map((s) => s.product_id)));
  const trainerIds = Array.from(
    new Set((sessions ?? []).map((s) => s.trainer_member_id).filter((v): v is number => !!v))
  );
  const [bookingsRes, prodRes, trainerRes] = await Promise.all([
    ids.length
      ? supabase.from("crm_class_bookings").select("session_id").in("session_id", ids).eq("status", "booked")
      : Promise.resolve({ data: [] as { session_id: number }[] }),
    productIds.length
      ? supabase.from("crm_products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    trainerIds.length
      ? supabase.from("crm_center_members").select("id, display_name").in("id", trainerIds)
      : Promise.resolve({ data: [] as { id: number; display_name: string }[] }),
  ]);
  const bookedCount = new Map<number, number>();
  for (const b of bookingsRes.data ?? []) bookedCount.set(b.session_id, (bookedCount.get(b.session_id) ?? 0) + 1);
  const prodName = new Map((prodRes.data ?? []).map((p) => [p.id, p.name]));
  const trainerName = new Map((trainerRes.data ?? []).map((t) => [t.id, t.display_name]));

  return NextResponse.json({
    sessions: (sessions ?? []).map((s) => ({
      ...s,
      product_name: prodName.get(s.product_id) ?? null,
      trainer_name: s.trainer_member_id ? trainerName.get(s.trainer_member_id) ?? null : null,
      booked_count: bookedCount.get(s.id) ?? 0,
    })),
  });
}

/**
 * POST /api/crm/class-sessions
 * body: { product_id, trainer_member_id?, starts_at, ends_at?, capacity?, title? }
 * 강사가 특정 '클래스 상품'으로 수업 세션을 등록. 권한: schedule.class_create.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "schedule.class_create"))) {
    return NextResponse.json({ error: "클래스 수업을 생성할 권한이 없습니다" }, { status: 403 });
  }

  let body: {
    product_id?: number;
    trainer_member_id?: number | null;
    starts_at?: string;
    ends_at?: string;
    capacity?: number;
    title?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const productId = Number(body.product_id) || 0;
  if (!productId || !body.starts_at) {
    return NextResponse.json({ error: "클래스 상품과 시작 시각이 필요합니다" }, { status: 400 });
  }
  const { data: product } = await supabase
    .from("crm_products")
    .select("id, type, name, capacity, session_minutes")
    .eq("id", productId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  const p = product as { type?: string; capacity?: number; session_minutes?: number } | null;
  if (!p || p.type !== "class") {
    return NextResponse.json({ error: "클래스 상품을 선택해 주세요" }, { status: 400 });
  }

  const startsAt = new Date(body.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "시작 시각 형식 오류" }, { status: 400 });
  }
  const endsAt = body.ends_at
    ? new Date(body.ends_at)
    : new Date(startsAt.getTime() + Math.max(1, p.session_minutes || 60) * 60000);
  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: "종료 시각이 시작 이후여야 합니다" }, { status: 400 });
  }
  const capacity = Math.max(1, Number(body.capacity) || p.capacity || 1);
  const trainerId = Number(body.trainer_member_id) || ctx.centerMemberId;

  const { data: created, error } = await supabase
    .from("crm_class_sessions")
    .insert({
      center_id: ctx.centerId,
      product_id: productId,
      trainer_member_id: trainerId,
      title: body.title?.trim() || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      capacity,
      status: "open",
      created_by_uid: ctx.uid,
    } as never)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: "등록 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: (created as { id: number }).id });
}
