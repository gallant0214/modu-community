import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  const { data: report, error: fetchErr } = await supabase
    .from("reports")
    .select("target_type, target_id")
    .eq("id", Number(id))
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: "신고를 찾을 수 없습니다" }, { status: 404 });

  const { target_type, target_id } = report;
  const tableName =
    target_type === "job_post" ? "job_posts" : target_type === "post" ? "posts" : "comments";

  await supabase.from(tableName).update({ hidden: false }).eq("id", target_id);

  await supabase
    .from("reports")
    .update({
      resolved: false,
      resolved_at: null,
      target_hidden: false,
    })
    .eq("id", Number(id));

  return NextResponse.json({ success: true });
}
