import { sql } from "@/app/lib/db";
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

  await sql`INSERT INTO reports (target_type, target_id, post_id, category_id, reason, custom_reason)
    VALUES (${target_type}, ${Number(target_id)}, ${Number(post_id)}, ${Number(category_id)}, ${sanitize(validateLength(reason.trim(), 200))}, ${custom_reason ? sanitize(validateLength(custom_reason.trim(), 500)) : null})`;
  return NextResponse.json({ success: true });
}
