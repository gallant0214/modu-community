export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { escapePostgrestQuery } from "@/app/lib/security";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";

export async function GET(req: NextRequest) {
  const rawQ = req.nextUrl.searchParams.get("q")?.trim();
  const q = rawQ ? escapePostgrestQuery(rawQ) : "";
  if (!q) {
    return NextResponse.json({ posts: [] });
  }

  const blocked = await getBlockedUidsForRequest(req);
  const wild = `*${q}*`;
  const perPage = 20;
  const fetchSize = perPage + Math.min(blocked.length, 20);

  const { data, error } = await supabase
    .from("posts")
    .select("*, categories(name, emoji)")
    .or("is_notice.eq.false,is_notice.is.null")
    .or(`title.ilike.${wild},content.ilike.${wild},region.ilike.${wild}`)
    .order("created_at", { ascending: false })
    .limit(fetchSize);

  if (error) {
    return NextResponse.json({ posts: [], error: error.message }, { status: 500 });
  }

  const blockedSet = new Set(blocked);
  const posts = data
    .filter((p) => !p.firebase_uid || !blockedSet.has(p.firebase_uid))
    .slice(0, perPage)
    .map(({ categories: cat, ...p }) => ({
      ...p,
      category_name: cat?.name ?? null,
      category_emoji: cat?.emoji ?? null,
    }));

  return NextResponse.json({ posts });
}
