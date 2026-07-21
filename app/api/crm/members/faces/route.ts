import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/faces
 * 얼굴 사진(face_image_data)이 등록된 활성 회원 목록. 터치출석 얼굴인식용.
 * 응답: { faces: [{ id, name, face_image_data }] }
 *
 * ⚠️ face_image_data 는 회원당 ~25KB base64 라 payload 가 큼(등록 회원 수 × 25KB).
 * 얼굴인식 화면 최초 1회만 호출해 브라우저에서 디스크립터 계산에 사용.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  type Face = { id: number; name: string; face_image_data: string | null };
  const faces: Face[] = [];
  const pageSize = 500;
  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await supabase
      .from("crm_members")
      .select("id, name, face_image_data")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .not("face_image_data", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    faces.push(...(data as Face[]));
    if (data.length < pageSize) break;
  }

  return NextResponse.json({ faces });
}
