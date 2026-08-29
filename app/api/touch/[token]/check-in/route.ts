import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";
import { runCheckIn } from "@/app/lib/crm-checkin";
import { notifyCenterStaffAttendance } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/touch/[token]/check-in  { member_id? | member_token? , source? }
 * 공개 터치출석: 토큰 센터의 회원을 체크인.
 *  - member_id: 번호/얼굴 선택 후 회원 id
 *  - member_token: 회원 앱 QR 에 담긴 checkin_token (QR 출석)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ error: "유효하지 않은 링크예요" }, { status: 404 });
  }

  let body: { member_id?: number; member_token?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const memberId = Number(body.member_id) || 0;
  const memberToken = (body.member_token ?? "").trim();
  // 공개 링크는 번호/얼굴/QR 만 허용
  const source =
    body.source === "touch_face"
      ? "touch_face"
      : body.source === "touch_qr"
        ? "touch_qr"
        : "touch_number";
  if (!memberId && !memberToken) {
    return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });
  }

  // 회원이 이 센터 소속(활성)인지 검증 — QR(member_token) 우선, 없으면 member_id
  let memberQuery = supabase
    .from("crm_members")
    .select("id, name, phone, birth")
    .eq("center_id", center.centerId)
    .eq("status", "active");
  memberQuery = memberToken
    ? memberQuery.eq("checkin_token", memberToken)
    : memberQuery.eq("id", memberId);
  const { data: member } = await memberQuery.maybeSingle();
  if (!member) {
    return NextResponse.json(
      { error: memberToken ? "QR 인식 실패 · 등록되지 않은 코드예요" : "회원을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const result = await runCheckIn(center.centerId, member, source);
  if ("error" in result) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });
  }
  if (!("duplicate" in result && result.duplicate)) {
    const memberName = member.name;
    const mId = member.id;
    after(() => notifyCenterStaffAttendance({ centerId: center.centerId, memberId: mId, memberName, kind: "in" }));
  }
  return NextResponse.json(result);
}
