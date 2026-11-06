import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// PATCH { password, ...fields }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { password, ...payload } = body;

  const adminErr = await verifyAdmin(request, password || "");
  if (adminErr) return adminErr;

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
  revalidatePath("/api/practical-oral-notice");
  revalidatePath("/practical/notice");
  if (data?.slug) revalidatePath(`/practical/notice/${data.slug}`);
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

  const adminErr = await verifyAdmin(request, password || "");
  if (adminErr) return adminErr;

  const { error } = await supabase
    .from("practical_oral_notices")
    .delete()
    .eq("id", Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/api/practical-oral-notice");
  revalidatePath("/practical/notice");
  return NextResponse.json({ success: true });
}
