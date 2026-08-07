import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/trainer-app/device-tokens  { centerId, token, platform }
 * 강사 앱 디바이스 토큰 등록/갱신 (예약 요청·취소 등 푸시용).
 * 토큰은 crm_staff_device_tokens 에 저장(강사 firebase_uid 기준, token unique).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "토큰이 없습니다" }, { status: 400 });
  const platform = body.platform === "ios" || body.platform === "android" ? body.platform : null;

  const { error } = await supabase.from("crm_staff_device_tokens").upsert(
    {
      token,
      firebase_uid: ctx.uid,
      center_member_id: ctx.centerMemberId,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) {
    return NextResponse.json({ error: "등록 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/trainer-app/device-tokens  { token }
 */
export async function DELETE(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "토큰이 없습니다" }, { status: 400 });
  await supabase.from("crm_staff_device_tokens").delete().eq("token", token);
  return NextResponse.json({ ok: true });
}
