import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { invalidateCache } from "@/app/lib/cache";
import { newPosts, pickRegion } from "./data";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function getAdminPassword(): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return process.env.ADMIN_PASSWORD ?? null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await supabase.from("admin_settings").select("value").eq("key", "admin_password").maybeSingle();
  return data?.value ?? process.env.ADMIN_PASSWORD ?? null;
}

async function flushCommunityCache(categoryIds: number[]) {
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  for (const id of categoryIds) revalidatePath(`/category/${id}`);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const inputPw: string = body?.password ?? "";
  const cacheOnly: boolean = body?.cacheOnly === true;

  const adminPw = await getAdminPassword();
  if (!adminPw || inputPw !== adminPw) {
    return NextResponse.json({ success: false, error: "invalid_password" }, { status: 401 });
  }

  const allCategoryIds = Array.from(new Set(newPosts.map((p) => p.categoryId)));

  if (cacheOnly) {
    await flushCommunityCache(allCategoryIds);
    return NextResponse.json({ success: true, cacheOnly: true });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let postsInserted = 0;
  let commentsInserted = 0;

  for (const post of newPosts) {
    const region = pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;
    const { data: p, error: pErr } = await supabase
      .from("posts")
      .insert({
        category_id: post.categoryId,
        title: post.title,
        content: post.content,
        author: post.author,
        password: "__seed_community__",
        ip_address: "seed_community",
        region,
        tags: "기타",
        views,
        created_at: post.date,
      })
      .select("id")
      .single();
    if (pErr || !p) continue;
    postsInserted++;
    const postId = p.id;

    for (const c of post.comments) {
      const d = new Date(post.date);
      d.setHours(d.getHours() + c.hoursOffset);
      const { error: cErr } = await supabase.from("comments").insert({
        post_id: postId,
        author: c.author,
        content: c.content,
        password: "__seed_community__",
        ip_address: "seed_community",
        created_at: d.toISOString(),
      });
      if (!cErr) commentsInserted++;
    }

    const { count } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", postId);
    await supabase.from("posts").update({ comments_count: count ?? 0 }).eq("id", postId);
  }

  await flushCommunityCache(allCategoryIds);
  return NextResponse.json({ success: true, postsInserted, commentsInserted });
}
