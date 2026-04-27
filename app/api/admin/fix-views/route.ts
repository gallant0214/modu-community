import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  const { data: posts, error: fetchErr } = await supabase
    .from("posts")
    .select("id")
    .in("password", ["__seed_community__", "__seed__"])
    .lt("views", 5);
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  let updated = 0;
  for (const post of posts || []) {
    const randomViews = Math.floor(Math.random() * 31) + 20;
    await supabase.from("posts").update({ views: randomViews }).eq("id", post.id);
    updated++;
  }

  return NextResponse.json({ success: true, updated });
}
