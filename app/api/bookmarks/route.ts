import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/bookmarks?type=posts|jobs — 내 북마크 목록
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "posts";

  try {
    if (type === "jobs") {
      // 구인 북마크
      try {
        const rows = await sql`
          SELECT j.*, pb.created_at AS bookmarked_at
          FROM job_post_bookmarks pb
          JOIN job_posts j ON j.id = pb.job_post_id
          WHERE pb.firebase_uid = ${user.uid}
          ORDER BY pb.created_at DESC
        `;
        return NextResponse.json({ bookmarks: rows });
      } catch {
        return NextResponse.json({ bookmarks: [] });
      }
    } else {
      // 게시글 북마크
      try {
        const rows = await sql`
          SELECT p.*, c.name AS category_name, pb.created_at AS bookmarked_at
          FROM post_bookmarks pb
          JOIN posts p ON p.id = pb.post_id
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE pb.firebase_uid = ${user.uid}
          ORDER BY pb.created_at DESC
        `;
        return NextResponse.json({ bookmarks: rows });
      } catch {
        return NextResponse.json({ bookmarks: [] });
      }
    }
  } catch {
    return NextResponse.json({ bookmarks: [] });
  }
}
