import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";

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
    .select("id, name, phone, face_image_data")
    .eq("center_id", center.centerId)
    .eq("status", "active")
    .eq("attendance_no", no)
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 얼굴 사진 자체는 공개하지 않고, '등록 여부(has_face)'만 반환 —
  // 얼굴 미등록자에게 현장 촬영 권유를 띄우기 위함(사진 데이터는 응답에서 제외).
  const members = (data ?? []).map(
    (m: { id: number; name: string; phone: string | null; face_image_data: string | null }) => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      has_face: !!m.face_image_data,
    })
  );
  return NextResponse.json({ members });
}
