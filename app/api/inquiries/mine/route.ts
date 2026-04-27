import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/inquiries/mine — 로그인한 사용자 본인의 문의만 반환
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  }

  try {
    const email = user.email ?? "";
    let query = supabase
      .from("inquiries")
      .select("id, author, title, content, reply, replied_at, hidden, created_at, email")
      .order("created_at", { ascending: false });

    if (email) {
      query = query.or(`firebase_uid.eq.${user.uid},email.eq.${email}`);
    } else {
      query = query.eq("firebase_uid", user.uid);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
