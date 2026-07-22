import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberContext, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/member/push-token  { token, platform }
 * 회원 앱 디바이스 토큰 등록/갱신 (예약 승인·거절·리마인더 푸시용).
 */
export async function POST(request: Request) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;

  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
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
 * DELETE /api/member/push-token  { token }
 * 로그아웃 시 토큰 제거.
 */
export async function DELETE(request: Request) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "토큰이 없습니다" }, { status: 400 });

  await supabase
    .from("crm_member_device_tokens")
    .delete()
    .eq("token", token)
    .eq("member_id", ctx.memberId);

  return NextResponse.json({ ok: true });
}
