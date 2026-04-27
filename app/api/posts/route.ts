import { supabase } from "@/app/lib/supabase";
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

  const { error } = await supabase.from("posts").insert({
    category_id: Number(category_id),
    title: sanitize(validateLength(title.trim(), 200)),
    content: sanitize(validateLength(content.trim(), 50000)),
    author: sanitize(validateLength(author.trim(), 50)),
    password: (password || "").trim(),
    region: sanitize(validateLength((region || "전국").trim(), 50)),
    tags: sanitize(validateLength((tags || "").trim(), 200)),
    ip_address: ipAddr,
    firebase_uid: user.uid,
    images: (images || "").trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/community");
  revalidatePath(`/category/${Number(category_id)}`);

  await invalidateCache("posts:*").catch(() => {});

  return NextResponse.json({ success: true });
}
