import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/practical-oral-notice/[slug]?audience=main|disabled
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const audience = searchParams.get("audience") === "disabled" ? "disabled" : "main";

  const { data, error } = await supabase
    .from("practical_oral_notices")
    .select("*")
    .eq("audience", audience)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
