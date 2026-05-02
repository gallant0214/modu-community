import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET ?password=...&audience=main|disabled  → 관리자용 전체 목록 (비활성 포함)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get("password") || "";
  const audience = searchParams.get("audience") === "disabled" ? "disabled" : "main";

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("practical_oral_notices")
    .select("*")
    .eq("audience", audience)
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notices: data || [] });
}

// POST { password, audience, slug, icon, badge, title, summary, content, display_order, is_active }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, ...payload } = body;

  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const audience = payload.audience === "disabled" ? "disabled" : "main";
  if (!payload.slug?.trim() || !payload.title?.trim()) {
    return NextResponse.json({ error: "slug와 title은 필수입니다" }, { status: 400 });
  }

  const insert = {
    audience,
    slug: payload.slug.trim(),
    icon: payload.icon || null,
    badge: payload.badge || null,
    title: payload.title.trim(),
    summary: payload.summary || "",
    content: payload.content || "",
    display_order: Number(payload.display_order) || 0,
    is_active: payload.is_active !== false,
  };

  const { data, error } = await supabase
    .from("practical_oral_notices")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/api/practical-oral-notice");
  revalidatePath("/practical/notice");
  return NextResponse.json({ success: true, notice: data });
}
