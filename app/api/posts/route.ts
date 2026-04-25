import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { category_id, title, content, author, password, region, tags, images } = body;

  if (!title?.trim() || !content?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요" }, { status: 400 });
  }

  const h = await headers();
  const ipAddr = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const uid = user.uid;

  await sql`INSERT INTO posts (category_id, title, content, author, password, region, tags, ip_address, firebase_uid, images)
    VALUES (${Number(category_id)}, ${sanitize(validateLength(title.trim(), 200))}, ${sanitize(validateLength(content.trim(), 50000))}, ${sanitize(validateLength(author.trim(), 50))}, ${(password || "").trim()}, ${sanitize(validateLength((region || "전국").trim(), 50))}, ${sanitize(validateLength((tags || "").trim(), 200))}, ${ipAddr}, ${uid}, ${(images || "").trim()})`;

  revalidatePath("/community");
  revalidatePath(`/category/${Number(category_id)}`);

  // 게시글 목록 Upstash 캐시 즉시 무효화 (앱/모바일 클라이언트가 새 글을 즉시 볼 수 있도록)
  invalidateCache("posts:*").catch(() => {});

  return NextResponse.json({ success: true });
}
