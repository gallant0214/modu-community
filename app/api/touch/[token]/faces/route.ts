import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/touch/[token]/faces
 * 공개 터치출석(얼굴 인식)용. 토큰 센터 회원 중 얼굴 디스크립터가 있는 회원만
 * 벡터(~1KB)로 반환. (등록 사진 원본은 공개하지 않음)
 * 응답: { faces: [{ id, name, face_descriptor }], face_threshold }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ error: "유효하지 않은 링크예요" }, { status: 404 });
  }

  const [{ data: faces }, { data: st }] = await Promise.all([
    supabase
      .from("crm_members")
      .select("id, name, face_descriptor")
      .eq("center_id", center.centerId)
      .eq("status", "active")
      .not("face_descriptor", "is", null)
      .order("id", { ascending: true }),
    supabase
      .from("crm_touch_attendance_settings")
      .select("face_threshold")
      .eq("center_id", center.centerId)
      .maybeSingle(),
  ]);

  const threshold = Number((st as { face_threshold?: number } | null)?.face_threshold);
  return NextResponse.json({
    faces: faces ?? [],
    face_threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
  });
}
