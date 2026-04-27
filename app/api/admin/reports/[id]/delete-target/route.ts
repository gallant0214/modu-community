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
    .select("target_type, target_id, post_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: "신고를 찾을 수 없습니다" }, { status: 404 });

  const { target_type, target_id, post_id } = report;

  if (target_type === "job_post") {
    await supabase.from("job_post_likes").delete().eq("job_post_id", target_id);
    await supabase.from("job_posts").delete().eq("id", target_id);
  } else if (target_type === "post") {
    await supabase.from("comments").delete().eq("post_id", target_id);
    await supabase.from("posts").delete().eq("id", target_id);
  } else {
    await supabase.from("comments").delete().eq("id", target_id);
    if (post_id) {
      const { count } = await supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("post_id", post_id);
      await supabase
        .from("posts")
        .update({ comments_count: count ?? 0 })
        .eq("id", post_id);
    }
  }

  await supabase
    .from("reports")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
    })
    .eq("id", Number(id));

  return NextResponse.json({ success: true });
}
