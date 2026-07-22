import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberContext, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

async function loadOwn(ctx: { centerId: number; memberId: number }, id: number) {
  const { data } = await supabase
    .from("crm_reservations")
    .select("id, pass_id, member_id, trainer_member_id, starts_at, ends_at, status")
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  return data;
}

/**
 * GET /api/member/reservations/[id]
 * 예약 상세 (예약확인/상세 화면) — 수강권명·트레이너·센터·시간.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;
  const { id } = await params;

  const res = await loadOwn(ctx, Number(id));
  if (!res) return NextResponse.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 });

  const [{ data: pass }, { data: trainer }, { data: settings }] = await Promise.all([
    res.pass_id
      ? supabase.from("crm_passes").select("lesson_kind, session_minutes").eq("id", res.pass_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("crm_center_members").select("display_name").eq("id", res.trainer_member_id).maybeSingle(),
    supabase
      .from("crm_center_settings")
      .select("cancel_enabled, cancel_hours")
      .eq("center_id", ctx.centerId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    reservation: {
      id: res.id,
      status: res.status,
      startsAt: res.starts_at,
      endsAt: res.ends_at,
      lessonKind: pass?.lesson_kind ?? "",
      trainerName: trainer?.display_name ?? "트레이너",
      memberName: ctx.name,
      centerName: ctx.centerName,
      cancelEnabled: settings?.cancel_enabled ?? true,
      cancelHours: settings?.cancel_hours ?? 6,
    },
  });
}

/**
 * DELETE /api/member/reservations/[id]
 * 회원이 예약 취소.
 *  - requested(예약대기): 언제든 취소 가능(단순 요청 철회).
 *  - booked(예약완료): cancel_enabled + 마감시간(cancel_hours) 규정 적용.
 *  - 세션 차감은 출석 시점에만 발생하므로 취소로 인한 차감 없음.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;
  const { id } = await params;

  const res = await loadOwn(ctx, Number(id));
  if (!res) return NextResponse.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 });

  if (res.status !== "requested" && res.status !== "booked") {
    return NextResponse.json({ error: "취소할 수 없는 예약이에요" }, { status: 400 });
  }

  if (res.status === "booked") {
    const { data: settings } = await supabase
      .from("crm_center_settings")
      .select("cancel_enabled, cancel_hours")
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (settings && settings.cancel_enabled === false) {
      return NextResponse.json({ error: "앱에서 취소가 불가능해요. 센터에 문의해주세요." }, { status: 403 });
    }
    const cancelHours = settings?.cancel_hours ?? 6;
    const deadline = new Date(res.starts_at).getTime() - cancelHours * 3600 * 1000;
    if (Date.now() > deadline) {
      return NextResponse.json(
        { error: `수업 ${cancelHours}시간 전까지만 취소할 수 있어요` },
        { status: 403 }
      );
    }
  }

  const { error } = await supabase
    .from("crm_reservations")
    .update({
      status: "cancelled",
      cancelled_reason: res.status === "requested" ? "회원 요청 철회" : "회원 앱 취소",
      cancelled_by_uid: ctx.uid,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", res.id);

  if (error) {
    return NextResponse.json({ error: "취소 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
