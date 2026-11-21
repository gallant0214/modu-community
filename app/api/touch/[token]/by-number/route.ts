import { errLogOnly } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";
import { memberIdsWithFace } from "@/app/lib/crm-checkin";

export const dynamic = "force-dynamic";

/**
 * GET /api/touch/[token]/by-number?no=123
 * 공개 터치출석: 출석번호로 활성 회원 조회(토큰 센터 한정).
 * 응답: { members: [{ id, name, phone, has_face }] }
 * (얼굴 데이터는 공개하지 않음 — 번호 방식 전용)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ error: "유효하지 않은 링크예요" }, { status: 404 });
  }

  const url = new URL(request.url);
  const no = (url.searchParams.get("no") || "").trim();
  if (!no) {
    return NextResponse.json({ error: "출석번호를 입력해 주세요" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_members")
    .select("id, name, phone")
    .eq("center_id", center.centerId)
    .eq("status", "active")
    .eq("attendance_no", no)
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errLogOnly(error) }, { status: 500 });
  }

  // 얼굴 사진 자체는 공개하지 않고, '등록 여부(has_face)'만 반환 —
  // 얼굴 미등록자에게 현장 촬영 권유를 띄우기 위함. 사진 값은 받아오지도 않고 id 조회로만 판정.
  const rows = (data ?? []) as { id: number; name: string; phone: string | null }[];
  const withFace = await memberIdsWithFace(
    center.centerId,
    rows.map((m) => m.id)
  );
  const members = rows.map((m) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    has_face: withFace.has(m.id),
  }));
  return NextResponse.json({ members });
}
