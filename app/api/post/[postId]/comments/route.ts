import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return "";
  // IPv6-mapped IPv4 (::ffff:1.2.3.4) → IPv4 부분 추출
  const v4Match = ip.match(/(\d+\.\d+\.\d+\.\d+)/);
  if (v4Match) {
    const parts = v4Match[1].split(".");
    return `${parts[0]}.${parts[1]}`;
  }
  return "";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const rows = await sql`
    SELECT c.id, c.post_id, c.parent_id, c.author, c.content, COALESCE(c.likes, 0) AS likes,
      (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS reply_count,
      c.ip_address, c.created_at
    FROM comments c WHERE c.post_id = ${Number(postId)} ORDER BY c.created_at ASC`;
  const result = rows.map((c: Record<string, unknown>) => ({
    ...c,
    ip_display: maskIp(String(c.ip_address || "")),
    ip_address: undefined,
  }));
  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const pid = Number(postId);
  const body = await request.json();
  const { author, password, content, parent_id, category_id } = body;

  if (!author?.trim() || !password?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "모든 항목을 입력해주세요" }, { status: 400 });
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`INSERT INTO comments (post_id, parent_id, author, password, content, ip_address)
    VALUES (${pid}, ${parent_id ?? null}, ${author.trim()}, ${password.trim()}, ${content.trim()}, ${ip})`;
  await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${pid}) WHERE id = ${pid}`;

  return NextResponse.json({ success: true });
}
