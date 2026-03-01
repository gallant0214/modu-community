import { sql } from "@/app/lib/db";
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
  const rows = await sql`SELECT p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags, p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at, p.ip_address, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ${Number(postId)}`;
  if (rows.length === 0) {
    return NextResponse.json(null, { status: 404 });
  }
  const post = rows[0];
  return NextResponse.json({
    ...post,
    ip_display: maskIp(post.ip_address || ""),
    ip_address: undefined,
  });
}
