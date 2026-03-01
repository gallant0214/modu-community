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
  const rows = await sql`
    SELECT c.id, c.post_id, c.parent_id, c.author, c.content, COALESCE(c.likes, 0) AS likes,
      (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS reply_count,
      c.ip_address, c.created_at
    FROM comments c WHERE c.post_id = ${Number(postId)} ORDER BY c.created_at ASC`;
  const result = rows.map((c) => ({
    ...c,
    ip_display: maskIp(c.ip_address || ""),
    ip_address: undefined,
  }));
  return NextResponse.json(result);
}
