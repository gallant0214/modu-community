export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// POST /api/messages/[id]/read — 읽음 처리
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  await sql`UPDATE messages SET is_read = true WHERE id = ${Number(id)} AND receiver_uid = ${user.uid}`;

  return NextResponse.json({ success: true });
}
