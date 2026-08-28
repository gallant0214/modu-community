import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * 자주 쓰는 메세지 문구 (센터 공용).
 * GET  /api/crm/message-phrases           → { phrases: [{id, text}] }
 * POST /api/crm/message-phrases { text }   → 추가
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_message_phrases")
    .select("id, text, created_at")
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ phrases: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "문구를 입력해 주세요" }, { status: 400 });
  if (text.length > 1000)
    return NextResponse.json({ error: "문구가 너무 길어요(1000자 이내)" }, { status: 400 });

  // 중복 문구는 추가하지 않음
  const { data: dup } = await supabase
    .from("crm_message_phrases")
    .select("id")
    .eq("center_id", ctx.centerId)
    .eq("text", text)
    .maybeSingle();
  if (dup) return NextResponse.json({ ok: true, id: (dup as { id: number }).id, duplicate: true });

  const { data, error } = await supabase
    .from("crm_message_phrases")
    .insert({ center_id: ctx.centerId, text, created_by_uid: ctx.uid } as never)
    .select("id, text")
    .single();
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, phrase: data });
}
