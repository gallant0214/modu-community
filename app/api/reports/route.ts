import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { target_type, target_id, post_id, category_id, reason, custom_reason } = body;

  if (!reason?.trim()) {
    return NextResponse.json({ error: "신고 사유를 선택해주세요" }, { status: 400 });
  }

  await sql`INSERT INTO reports (target_type, target_id, post_id, category_id, reason, custom_reason)
    VALUES (${target_type}, ${Number(target_id)}, ${Number(post_id)}, ${Number(category_id)}, ${reason.trim()}, ${custom_reason?.trim() || null})`;
  return NextResponse.json({ success: true });
}
