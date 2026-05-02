import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// PATCH { password, ...fields }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { password, ...payload } = body;

  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const update: {
    icon?: string | null;
    badge?: string | null;
    title?: string;
    summary?: string;
    content?: string;
    display_order?: number;
    is_active?: boolean;
    slug?: string;
  } = {};
  if ("icon" in payload) update.icon = payload.icon;
  if ("badge" in payload) update.badge = payload.badge;
  if ("title" in payload) update.title = payload.title;
  if ("summary" in payload) update.summary = payload.summary;
  if ("content" in payload) update.content = payload.content;
  if ("display_order" in payload) update.display_order = Number(payload.display_order) || 0;
  if ("is_active" in payload) update.is_active = !!payload.is_active;
  if ("slug" in payload) update.slug = payload.slug;

  const { data, error } = await supabase
    .from("practical_oral_notices")
    .update(update)
    .eq("id", Number(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, notice: data });
}

// DELETE { password }
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { password } = body;

  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const { error } = await supabase
    .from("practical_oral_notices")
    .delete()
    .eq("id", Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
