import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { memberIdsWithFace } from "@/app/lib/crm-checkin";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/attendances/by-number?no=123
 * 출석번호(attendance_no)로 활성 회원 조회. 터치출석용.
 *
 * 동일 번호가 여러 명이면 전부 반환 → 클라이언트에서 본인 이름 선택.
 * 응답: { members: [{ id, name, phone }] }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const no = (url.searchParams.get("no") || "").trim();
  if (!no) {
    return NextResponse.json({ error: "출석번호를 입력해 주세요" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_members")
    .select("id, name, phone, birth, face_image_thumb")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .eq("attendance_no", no)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }

  // face_image_data 는 크므로 받아오지 않고 id 조회로 has_face 만 판정. thumb 는 확인용으로 함께 반환.
  const rows = (data ?? []) as {
    id: number;
    name: string;
    phone: string | null;
    birth: string | null;
    face_image_thumb: string | null;
  }[];
  const withFace = await memberIdsWithFace(
    ctx.centerId,
    rows.map((m) => m.id)
  );
  const members = rows.map((m) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    birth: m.birth,
    has_face: withFace.has(m.id),
    face_thumb: m.face_image_thumb,
  }));

  return NextResponse.json({ members });
}
