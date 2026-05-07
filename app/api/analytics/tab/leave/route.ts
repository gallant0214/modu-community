import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 비정상적으로 긴 visit (앱 백그라운드 후 sendBeacon 미발화 등) cap — 30분
const MAX_DURATION_MS = 30 * 60 * 1000;

// POST /api/analytics/tab/leave
// body: { visit_id }
// sendBeacon 으로 호출되므로 응답을 기대하지 않음 (그래도 200 반환)
export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // sendBeacon Blob 으로 들어온 경우 text 파싱 시도
    try {
      const txt = await request.text();
      body = txt ? JSON.parse(txt) : {};
    } catch {}
  }
  const visitId = Number(body?.visit_id);
  if (!visitId || Number.isNaN(visitId)) {
    return NextResponse.json({ error: "invalid visit_id" }, { status: 400 });
  }

  const { data: visit } = await (supabase as any)
    .from("tab_visits")
    .select("entered_at, left_at")
    .eq("id", visitId)
    .maybeSingle();

  if (!visit || visit.left_at) {
    // 이미 종료됐거나 존재하지 않음 — 멱등 처리
    return NextResponse.json({ ok: true });
  }

  const now = Date.now();
  const enteredMs = new Date(visit.entered_at).getTime();
  let durationMs = now - enteredMs;
  if (durationMs < 0) durationMs = 0;
  if (durationMs > MAX_DURATION_MS) durationMs = MAX_DURATION_MS;

  await (supabase as any)
    .from("tab_visits")
    .update({ left_at: new Date(now).toISOString(), duration_ms: durationMs })
    .eq("id", visitId);

  return NextResponse.json({ ok: true });
}
