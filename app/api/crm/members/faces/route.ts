import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

type Face = {
  id: number;
  name: string;
  face_image_data?: string | null;
  face_descriptor?: number[] | null;
};

/**
 * GET /api/crm/members/faces — 터치출석 얼굴인식용 등록 얼굴 목록.
 *
 * 성능: 디스크립터(face_descriptor)가 있는 회원은 이미지 없이 벡터(~1KB)만 반환하고,
 * 아직 디스크립터가 없는(레거시) 회원만 face_image_data 를 실어 브라우저에서 계산·백필하도록 한다.
 * 응답: { faces: [{ id, name, face_descriptor? , face_image_data? }] }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const faces: Face[] = [];
  const pageSize = 500;

  // 1) 디스크립터 보유 회원 — 벡터만 (이미지 미포함, 경량)
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabase
      .from("crm_members")
      .select("id, name, face_descriptor")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .not("face_descriptor", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    faces.push(...(data as unknown as Face[]));
    if (data.length < pageSize) break;
  }

  // 2) 디스크립터 없이 사진만 있는(레거시) 회원 — 이미지 실어 브라우저에서 계산 + 백필
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabase
      .from("crm_members")
      .select("id, name, face_image_data")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .is("face_descriptor", null)
      .not("face_image_data", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    faces.push(...(data as Face[]));
    if (data.length < pageSize) break;
  }

  return NextResponse.json({ faces });
}

/**
 * POST /api/crm/members/faces — 얼굴 디스크립터 백필 저장.
 * body: { member_id, descriptor: number[] }
 * 얼굴출석 화면이 레거시 회원 사진으로 디스크립터를 계산한 뒤 이 API 로 저장해두면,
 * 다음부터는 이미지 없이 벡터만 내려받아 매칭이 빠르고 정확해진다. (센터 스태프면 허용)
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { member_id?: number; descriptor?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const memberId = Number(body.member_id) || 0;
  const d = body.descriptor;
  if (!memberId || !Array.isArray(d) || d.length < 64 || d.length > 512 || !d.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return NextResponse.json({ error: "형식이 잘못됐어요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_members")
    .update({ face_descriptor: d } as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
