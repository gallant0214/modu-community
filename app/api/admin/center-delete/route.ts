import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/center-delete  { password, centerId }
 * 관리자(/developer)가 등록된 센터를 삭제. crm_centers 1행 삭제 →
 * center_id 를 FK(ON DELETE CASCADE)로 참조하는 모든 CRM 데이터(회원·수강권·매출·예약 등)가 함께 삭제된다.
 * 🚨 되돌릴 수 없음. 관리자 비밀번호 필수.
 */
export async function POST(req: Request) {
  let body: { password?: string; centerId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!(await verifyAdminPassword(body?.password ?? ""))) {
    return NextResponse.json({ error: "관리자 인증 실패" }, { status: 401 });
  }
  const id = Number(body?.centerId);
  if (!id) {
    return NextResponse.json({ error: "센터를 찾을 수 없습니다" }, { status: 400 });
  }

  // 삭제 전 센터 확인(이름 반환용)
  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!center) {
    return NextResponse.json({ error: "이미 삭제되었거나 없는 센터입니다" }, { status: 404 });
  }

  const { error } = await supabase.from("crm_centers").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: { id, name: (center as { name: string }).name } });
}
