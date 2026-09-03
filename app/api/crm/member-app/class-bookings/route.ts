import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/class-bookings?centerId=&from=&to=
 * 내 클래스 수업 예약 목록(스케줄 리스트·달력 표시용). status='booked'만.
 * from/to (YYYY-MM-DD) 로 세션 시작일 범위 필터(선택).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data: bookings } = await supabase
    .from("crm_class_bookings")
    .select("id, session_id, status")
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .eq("status", "booked");
  const sessionIds = Array.from(new Set((bookings ?? []).map((b) => b.session_id).filter(Boolean)));
  if (sessionIds.length === 0) return NextResponse.json({ bookings: [] });

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  let sq = supabase
    .from("crm_class_sessions")
    .select("id, product_id, trainer_member_id, title, starts_at, ends_at")
    .in("id", sessionIds);
  if (from) sq = sq.gte("starts_at", `${from}T00:00:00+09:00`);
  if (to) sq = sq.lte("starts_at", `${to}T23:59:59+09:00`);
  const { data: sessions } = await sq;

  const productIds = Array.from(new Set((sessions ?? []).map((s) => s.product_id).filter(Boolean)));
  const trainerIds = Array.from(new Set((sessions ?? []).map((s) => s.trainer_member_id).filter(Boolean)));
  const [prodRes, trainerRes] = await Promise.all([
    productIds.length
      ? supabase.from("crm_products").select("id, name").in("id", productIds as number[])
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    trainerIds.length
      ? supabase.from("crm_center_members").select("id, display_name").in("id", trainerIds as number[])
      : Promise.resolve({ data: [] as { id: number; display_name: string }[] }),
  ]);
  const productName = new Map((prodRes.data ?? []).map((p) => [p.id, p.name]));
  const trainerName = new Map((trainerRes.data ?? []).map((t) => [t.id, t.display_name]));
  const bookingBySession = new Map((bookings ?? []).map((b) => [b.session_id, b.id]));

  return NextResponse.json({
    bookings: (sessions ?? []).map((s) => ({
      booking_id: bookingBySession.get(s.id) ?? null,
      session_id: s.id,
      product_name: productName.get(s.product_id) ?? "클래스 수업",
      trainer_name: s.trainer_member_id ? trainerName.get(s.trainer_member_id) ?? null : null,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
    })),
  });
}

/**
 * POST /api/crm/member-app/class-bookings  { centerId, session_id }
 * 클래스 수업 예약(선착순). 예약 시 유효 클래스 수강권에서 1회 차감(consumed).
 * 규칙:
 *  - 구매한 그 상품의 세션만 예약 가능(유효 수강권·잔여>0·미만료)
 *  - 정원 초과 시 마감(선착순)
 *  - 예약 마감 시간(상품별 class_book_before_min): 수업 시작 N분 전이 지나면 예약 불가
 *  - 취소 마감 시간(상품별) 전 취소 시 차감 원복, 이후·노쇼는 차감 유지
 */
export async function POST(request: Request) {
  let body: { centerId?: number; session_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const centerId = Number(body.centerId);
  const sessionId = Number(body.session_id);
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;
  if (!sessionId) return NextResponse.json({ error: "수업을 선택해 주세요" }, { status: 400 });

  // 예약 정책
  const { data: settings } = await supabase
    .from("crm_center_settings")
    .select("class_booking_enabled")
    .eq("center_id", centerId)
    .maybeSingle();
  if (settings && (settings as { class_booking_enabled?: boolean }).class_booking_enabled === false) {
    return NextResponse.json({ error: "현재 클래스 수업 예약이 중지됐어요." }, { status: 403 });
  }

  // 세션 확인 (열림·미래)
  const { data: session } = await supabase
    .from("crm_class_sessions")
    .select("id, product_id, capacity, starts_at, status")
    .eq("id", sessionId)
    .eq("center_id", centerId)
    .maybeSingle();
  if (!session || session.status !== "open") {
    return NextResponse.json({ error: "예약할 수 없는 수업이에요." }, { status: 404 });
  }
  if (new Date(session.starts_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "이미 시작한 수업은 예약할 수 없어요." }, { status: 400 });
  }

  // 중복 예약 방지
  const { data: existing } = await supabase
    .from("crm_class_bookings")
    .select("id")
    .eq("session_id", sessionId)
    .eq("member_id", ctx.memberId)
    .eq("status", "booked")
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "이미 예약한 수업이에요.", already: true }, { status: 409 });

  // 정원(선착순)
  const { count } = await supabase
    .from("crm_class_bookings")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "booked");
  if ((count ?? 0) >= session.capacity) {
    return NextResponse.json({ error: "정원이 모두 찼어요.", full: true }, { status: 409 });
  }

  // 유효 클래스 수강권(그 상품) — 만료 임박 순으로 1개 선택해 차감
  // 상품 이용 방식: 기간제=무제한(차감X) / 횟수제=1회 차감
  const { data: product } = await supabase
    .from("crm_products")
    .select("billing_mode, class_book_before_min")
    .eq("id", session.product_id)
    .maybeSingle();
  const isPeriod = (product as { billing_mode?: string } | null)?.billing_mode === "period";

  // 예약 마감 시간 체크 — 수업 시작 N분 전이 지나면 예약 불가
  const bookBeforeMin =
    (product as { class_book_before_min?: number } | null)?.class_book_before_min ?? 0;
  if (bookBeforeMin > 0) {
    const bookDeadline = new Date(session.starts_at).getTime() - bookBeforeMin * 60000;
    if (Date.now() >= bookDeadline) {
      const h = Math.floor(bookBeforeMin / 60);
      const m = bookBeforeMin % 60;
      const label = h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ""}` : `${m}분`;
      return NextResponse.json(
        { error: `예약이 마감됐어요. 수업 시작 ${label} 전까지만 예약할 수 있어요.`, closed: true },
        { status: 409 }
      );
    }
  }

  // 유효 수강권(그 상품). 횟수제는 잔여>0 필요, 기간제는 유효(만료 전)면 OK.
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let passQuery = supabase
    .from("crm_passes")
    .select("id, remaining_sessions, expires_at")
    .eq("center_id", centerId)
    .eq("member_id", ctx.memberId)
    .eq("product_id", session.product_id)
    .eq("status", "valid")
    .order("expires_at", { ascending: true });
  if (!isPeriod) passQuery = passQuery.gt("remaining_sessions", 0);
  const { data: passes } = await passQuery;
  const usable = (passes ?? []).filter((p) => !p.expires_at || p.expires_at >= todayKst);
  const pass = usable[0];
  if (!pass) {
    return NextResponse.json({ error: "이 수업을 예약할 수 있는 수강권이 없어요.", noPass: true }, { status: 403 });
  }

  // 예약 생성 — 기간제는 consumed=false(차감 없음). 활성 유니크로 동시 중복예약 방지.
  const { data: created, error: insErr } = await supabase
    .from("crm_class_bookings")
    .insert({
      center_id: centerId,
      session_id: sessionId,
      member_id: ctx.memberId,
      pass_id: pass.id,
      status: "booked",
      consumed: !isPeriod,
    } as never)
    .select("id")
    .single();
  if (insErr) {
    // 유니크 충돌(동시 중복예약) 등
    return NextResponse.json({ error: "예약에 실패했어요. 다시 시도해 주세요." }, { status: 409 });
  }
  // 횟수제만 잔여 1회 차감
  if (!isPeriod) {
    await supabase
      .from("crm_passes")
      .update({ remaining_sessions: Math.max(0, (pass.remaining_sessions ?? 1) - 1) } as never)
      .eq("id", pass.id);
  }

  return NextResponse.json({ ok: true, booking_id: (created as { id: number }).id, unlimited: isPeriod });
}

/**
 * DELETE /api/crm/member-app/class-bookings  { centerId, booking_id }
 * 예약 취소. 취소 마감 전이면 차감 원복(잔여 +1), 이후면 차감 유지(노쇼 처리).
 */
export async function DELETE(request: Request) {
  let body: { centerId?: number; booking_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const centerId = Number(body.centerId);
  const bookingId = Number(body.booking_id);
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;
  if (!bookingId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: booking } = await supabase
    .from("crm_class_bookings")
    .select("id, session_id, member_id, pass_id, status, consumed")
    .eq("id", bookingId)
    .eq("center_id", centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  if (!booking || booking.status !== "booked") {
    return NextResponse.json({ error: "취소할 예약이 없어요." }, { status: 404 });
  }

  const { data: session } = await supabase
    .from("crm_class_sessions")
    .select("starts_at, product_id")
    .eq("id", booking.session_id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "수업 정보를 찾을 수 없어요." }, { status: 404 });
  if (new Date(session.starts_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "이미 시작한 수업은 취소할 수 없어요." }, { status: 400 });
  }

  const { data: product } = await supabase
    .from("crm_products")
    .select("class_cancel_before_min")
    .eq("id", session.product_id)
    .maybeSingle();
  const cancelMin = (product as { class_cancel_before_min?: number } | null)?.class_cancel_before_min ?? 60;
  const deadline = new Date(session.starts_at).getTime() - cancelMin * 60000;
  const refund = Date.now() < deadline; // 마감 전 취소 = 차감 원복

  if (refund && booking.consumed && booking.pass_id) {
    const { data: pass } = await supabase
      .from("crm_passes")
      .select("remaining_sessions")
      .eq("id", booking.pass_id)
      .maybeSingle();
    if (pass) {
      await supabase
        .from("crm_passes")
        .update({ remaining_sessions: (pass.remaining_sessions ?? 0) + 1 } as never)
        .eq("id", booking.pass_id);
    }
  }

  await supabase
    .from("crm_class_bookings")
    .update({
      status: "cancelled",
      consumed: refund ? false : booking.consumed,
      cancelled_at: new Date().toISOString(),
    } as never)
    .eq("id", bookingId);

  return NextResponse.json({
    ok: true,
    refunded: refund,
    message: refund ? "예약이 취소됐어요. (차감 없음)" : "취소됐지만 취소 마감이 지나 횟수는 차감돼요.",
  });
}
