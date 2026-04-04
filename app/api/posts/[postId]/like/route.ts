import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { postId } = await params;
  const id = Number(postId);

  await sql`ALTER TABLE post_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  // firebase_uid로 좋아요 여부 확인
  const existing = await sql`
    SELECT id FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid}
  `;

  if (existing.length > 0) {
    await sql`DELETE FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
    await sql`UPDATE posts SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${id}`;
    return NextResponse.json({ unliked: true });
  }

  await sql`INSERT INTO post_likes (post_id, ip_address, firebase_uid) VALUES (${id}, '', ${user.uid})`;
  await sql`UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ${id}`;
  return NextResponse.json({ unliked: false });
}
