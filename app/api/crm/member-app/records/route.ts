import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

interface RecordItemInput {
  type: string;
  label?: string | null;
  value_json?: unknown;
  photo_url?: string | null;
  thumb_url?: string | null;
}
const ITEM_TYPES = ["meal", "body_photo", "exercise", "water", "mood", "weight"];

/**
 * GET /api/crm/member-app/records?centerId=&from=&to=
 * 내 데일리 기록 목록(+세부 항목). 기본: 최근 30일.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const today = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 29 * 24 * 3600 * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || today;

  const { data: records, error } = await supabase
    .from("crm_member_daily_records")
    .select("id, record_date, water_ml, weight_kg, mood, exercise_minutes, exercise_memo, meal_summary, memo, share_with_trainer")
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .gte("record_date", from)
    .lte("record_date", to)
    .order("record_date", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const list = records ?? [];

  const recordIds = list.map((r) => r.id);
  const itemsByRecord = new Map<number, unknown[]>();
  if (recordIds.length) {
    const { data: items } = await supabase
      .from("crm_member_record_items")
      .select("id, record_id, type, label, value_json, photo_url, thumb_url")
      .in("record_id", recordIds)
      .order("created_at", { ascending: true });
    for (const it of items ?? []) {
      const arr = itemsByRecord.get(it.record_id) ?? [];
      arr.push({ id: it.id, type: it.type, label: it.label, value: it.value_json, photoUrl: it.photo_url, thumbUrl: it.thumb_url });
      itemsByRecord.set(it.record_id, arr);
    }
  }

  return NextResponse.json({
    records: list.map((r) => ({
      id: r.id,
      recordDate: r.record_date,
      waterMl: r.water_ml,
      weightKg: r.weight_kg,
      mood: r.mood,
      exerciseMinutes: r.exercise_minutes,
      exerciseMemo: r.exercise_memo,
      mealSummary: r.meal_summary,
      memo: r.memo,
      shareWithTrainer: r.share_with_trainer,
      items: itemsByRecord.get(r.id) ?? [],
    })),
  });
}

/**
 * POST /api/crm/member-app/records
 * 오늘(또는 지정 날짜) 기록 저장 — center+member+date 기준 upsert.
 * body: { centerId, record_date, water_ml?, weight_kg?, mood?, exercise_minutes?,
 *         exercise_memo?, meal_summary?, memo?, share_with_trainer?, items?: [...] }
 * items 를 넘기면 해당 날짜 항목을 통째로 교체한다.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const recordDate = typeof body.record_date === "string" ? body.record_date : null;
  if (!recordDate || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요" }, { status: 400 });
  }

  const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const { data: rec, error } = await supabase
    .from("crm_member_daily_records")
    .upsert(
      {
        center_id: ctx.centerId,
        member_id: ctx.memberId,
        record_date: recordDate,
        water_ml: numOrNull(body.water_ml),
        weight_kg: numOrNull(body.weight_kg),
        mood: strOrNull(body.mood),
        exercise_minutes: numOrNull(body.exercise_minutes),
        exercise_memo: strOrNull(body.exercise_memo),
        meal_summary: strOrNull(body.meal_summary),
        memo: strOrNull(body.memo),
        share_with_trainer: body.share_with_trainer === undefined ? true : !!body.share_with_trainer,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "center_id,member_id,record_date" }
    )
    .select("id")
    .single();
  if (error || !rec) {
    return NextResponse.json({ error: "저장 실패", detail: error?.message }, { status: 500 });
  }

  // items 교체 (넘어온 경우에만)
  if (Array.isArray(body.items)) {
    await supabase.from("crm_member_record_items").delete().eq("record_id", rec.id);
    const rows = (body.items as RecordItemInput[])
      .filter((it) => it && ITEM_TYPES.includes(it.type))
      .map((it) => ({
        record_id: rec.id,
        member_id: ctx.memberId,
        center_id: ctx.centerId,
        type: it.type,
        label: it.label ?? null,
        value_json: (it.value_json ?? null) as never,
        photo_url: it.photo_url ?? null,
        thumb_url: it.thumb_url ?? null,
      }));
    if (rows.length) await supabase.from("crm_member_record_items").insert(rows as never);
  }

  return NextResponse.json({ ok: true, recordId: rec.id });
}
