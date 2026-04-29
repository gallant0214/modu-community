export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// POST /api/users/block — 차단 (body: { nickname: string })
export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nickname = (body.nickname || "").trim();
  if (!nickname) return NextResponse.json({ error: "닉네임이 필요합니다" }, { status: 400 });

  const { data: target } = await supabase
    .from("nicknames")
    .select("firebase_uid")
    .eq("name", nickname)
    .maybeSingle();
  if (!target?.firebase_uid) return NextResponse.json({ error: "존재하지 않는 닉네임입니다" }, { status: 404 });
  if (target.firebase_uid === user.uid) {
    return NextResponse.json({ error: "자기 자신은 차단할 수 없습니다" }, { status: 400 });
  }

  const { error } = await supabase.from("user_blocks").upsert(
    {
      blocker_uid: user.uid,
      blocked_uid: target.firebase_uid,
      blocked_nickname: nickname,
    },
    { onConflict: "blocker_uid,blocked_uid" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/users/block — 차단 해제 (body: { nickname: string })
export async function DELETE(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nickname = (body.nickname || "").trim();
  if (!nickname) return NextResponse.json({ error: "닉네임이 필요합니다" }, { status: 400 });

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_uid", user.uid)
    .eq("blocked_nickname", nickname);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
