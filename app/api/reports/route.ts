import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { target_type, target_id, post_id, category_id, reason, custom_reason } = body;

  if (!reason?.trim()) {
    return NextResponse.json({ error: "신고 사유를 선택해주세요" }, { status: 400 });
  }

  const safePostId = post_id ? Number(post_id) : 0;
  const safeCategoryId = category_id ? Number(category_id) : 0;

  const { error } = await supabase.from("reports").insert({
    target_type,
    target_id: Number(target_id),
    post_id: safePostId,
    category_id: safeCategoryId,
    reason: sanitize(validateLength(reason.trim(), 200)),
    custom_reason: custom_reason
      ? sanitize(validateLength(custom_reason.trim(), 500))
      : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
