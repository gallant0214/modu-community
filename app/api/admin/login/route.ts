import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { password } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  const [reportsRes, inquiriesRes] = await Promise.all([
    supabase.rpc("admin_reports_with_targets"),
    supabase
      .from("inquiries")
      .select("id, author, email, title, content, reply, replied_at, hidden, read_at, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (reportsRes.error) {
    return NextResponse.json({ error: reportsRes.error.message }, { status: 500 });
  }
  if (inquiriesRes.error) {
    return NextResponse.json({ error: inquiriesRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    reports: reportsRes.data,
    inquiries: inquiriesRes.data,
  });
}
