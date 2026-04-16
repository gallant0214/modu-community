import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  await sql`UPDATE posts SET share_count = COALESCE(share_count, 0) + 1 WHERE id = ${Number(postId)}`;
  return NextResponse.json({ success: true });
}
