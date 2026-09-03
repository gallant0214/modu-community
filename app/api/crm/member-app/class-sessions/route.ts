import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/class-sessions?centerId=
 * 회원이 예약 가능한 클래스 수업 세션 목록.
 *  - 회원이 구매한 '클래스 상품'(유효 수강권, 잔여>0, 미만료)의 수업만 노출.
 *  - 예약 인원/정원/잔여석·내 예약 여부·취소마감 포함.
 *  - 상품별 '예약 마감 시간'(class_book_before_min)이 지난 수업은 목록에서 제외.
 *    단, 내가 이미 예약한 수업은 취소할 수 있어야 하므로 계속 노출.
 *  - 센터 예약정책 class_booking_enabled 꺼져 있으면 빈 목록.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const nowIso = new Date().toISOString();
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 예약 정책
  const { data: settings } = await supabase
    .from("crm_center_settings")
    .select("class_booking_enabled")
    .eq("center_id", centerId)
    .maybeSingle();
  if (settings && (settings as { class_booking_enabled?: boolean }).class_booking_enabled === false) {
    return NextResponse.json({ enabled: false, sessions: [] });
  }

  // 내 유효 수강권(만료 전) — 잔여는 상품 모드(횟수제/기간제)별로 판단
  const { data: passes } = await supabase
    .from("crm_passes")
    .select("id, product_id, remaining_sessions, expires_at, status")
    .eq("center_id", centerId)
    .eq("member_id", ctx.memberId)
    .eq("status", "valid");
  const passList = (passes ?? []).filter(
    (p) => p.product_id && (!p.expires_at || p.expires_at >= todayKst)
  );
  const productIds = Array.from(new Set(passList.map((p) => p.product_id as number)));
  if (productIds.length === 0) {
    return NextResponse.json({ enabled: true, sessions: [] });
  }
  // 클래스 상품만 (이용방식·취소마감 포함)
  const { data: products } = await supabase
    .from("crm_products")
    .select("id, name, type, billing_mode, class_cancel_before_min, class_book_before_min")
    .in("id", productIds)
    .eq("type", "class");
  // 상품별 예약 자격: 기간제=유효 수강권 있으면 OK / 횟수제=잔여>0 수강권 있어야 OK
  const classProductIds = new Set<number>();
  for (const p of products ?? []) {
    const mine = passList.filter((x) => x.product_id === p.id);
    const period = (p as { billing_mode?: string }).billing_mode === "period";
    const ok = period ? mine.length > 0 : mine.some((x) => (x.remaining_sessions ?? 0) > 0);
    if (ok) classProductIds.add(p.id);
  }
  const cancelMinByProduct = new Map(
    (products ?? []).map((p) => [p.id, (p as { class_cancel_before_min?: number }).class_cancel_before_min ?? 60])
  );
  // 예약 마감(분). 수업 시작 N분 전이 지나면 예약 불가 → 목록에서 숨김.
  const bookMinByProduct = new Map(
    (products ?? []).map((p) => [p.id, (p as { class_book_before_min?: number }).class_book_before_min ?? 0])
  );
  const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
  if (classProductIds.size === 0) return NextResponse.json({ enabled: true, sessions: [] });

  // 앞으로의 열린 세션(내 상품)
  const { data: sessions } = await supabase
    .from("crm_class_sessions")
    .select("id, product_id, trainer_member_id, title, starts_at, ends_at, capacity, status")
    .eq("center_id", centerId)
    .eq("status", "open")
    .in("product_id", Array.from(classProductIds))
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true });

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const [bookingsRes, myBookingsRes, trainerRes] = await Promise.all([
    sessionIds.length
      ? supabase.from("crm_class_bookings").select("session_id").in("session_id", sessionIds).eq("status", "booked")
      : Promise.resolve({ data: [] as { session_id: number }[] }),
    sessionIds.length
      ? supabase
          .from("crm_class_bookings")
          .select("id, session_id")
          .in("session_id", sessionIds)
          .eq("member_id", ctx.memberId)
          .eq("status", "booked")
      : Promise.resolve({ data: [] as { id: number; session_id: number }[] }),
    supabase
      .from("crm_center_members")
      .select("id, display_name")
      .eq("center_id", centerId),
  ]);
  const bookedCount = new Map<number, number>();
  for (const b of bookingsRes.data ?? []) bookedCount.set(b.session_id, (bookedCount.get(b.session_id) ?? 0) + 1);
  const myBooking = new Map((myBookingsRes.data ?? []).map((b) => [b.session_id, b.id]));
  const trainerName = new Map((trainerRes.data ?? []).map((t) => [t.id, t.display_name]));

  const nowMs = Date.now();
  return NextResponse.json({
    enabled: true,
    sessions: (sessions ?? [])
      .map((s) => {
        const booked = bookedCount.get(s.id) ?? 0;
        const cancelMin = cancelMinByProduct.get(s.product_id) ?? 60;
        const bookMin = bookMinByProduct.get(s.product_id) ?? 0;
        const startMs = new Date(s.starts_at).getTime();
        const cancelDeadline = new Date(startMs - cancelMin * 60000).toISOString();
        const bookDeadlineMs = startMs - bookMin * 60000;
        return {
          id: s.id,
          product_id: s.product_id,
          product_name: productName.get(s.product_id) ?? null,
          trainer_name: s.trainer_member_id ? trainerName.get(s.trainer_member_id) ?? null : null,
          title: s.title,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          capacity: s.capacity,
          booked_count: booked,
          spots_left: Math.max(0, s.capacity - booked),
          my_booking_id: myBooking.get(s.id) ?? null,
          cancel_deadline: cancelDeadline, // 이 시각 전 취소=차감 없음
          cancel_before_min: cancelMin,
          book_deadline: new Date(bookDeadlineMs).toISOString(), // 이 시각까지만 예약 가능
          book_before_min: bookMin,
          booking_closed: nowMs >= bookDeadlineMs,
        };
      })
      // 예약 마감이 지난 수업은 목록에서 제외 (내가 예약한 건은 취소용으로 남김)
      .filter((s) => !s.booking_closed || s.my_booking_id !== null),
  });
}
