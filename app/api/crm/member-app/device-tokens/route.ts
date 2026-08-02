import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/device-tokens  { centerId, token, platform }
 * 회원 앱 디바이스 토큰 등록/갱신 (예약 승인·거절·리마인더 푸시용).
 * 토큰은 crm_member_device_tokens 에 저장(센터 무관, 회원 uid 기준).
 */
export async function POST(request: Request) {
  let body: { centerId?: number; token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "토큰이 없습니다" }, { status: 400 });
  const platform = body.platform === "ios" || body.platform === "android" ? body.platform : null;

  const { error } = await supabase
    .from("crm_member_device_tokens")
    .upsert(
      {
        member_id: ctx.memberId,
        firebase_uid: ctx.uid,
        token,
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
 * DELETE /api/crm/member-app/device-tokens  { token }
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

  // 로그인만 확인되면 본인 토큰 삭제 (token unique)
  await supabase.from("crm_member_device_tokens").delete().eq("token", token);
  return NextResponse.json({ ok: true });
}
