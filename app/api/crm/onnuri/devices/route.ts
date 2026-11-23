import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { requirePermission } from "@/app/lib/crm-permissions";
import { newPairCode } from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * 카운터 공기계(온누리 알림 앱) 연결 관리 — 권한: settings.edit
 *   GET                       기기 목록 + 최근 알림 20건
 *   POST { name }             새 기기 + 6자리 연결 코드(10분 유효)
 *   POST { id, action:"code"} 기존 기기 코드 다시 만들기(재연결)
 *   DELETE ?id=               연결 해제(행은 기록으로 남김)
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "settings.edit");
  if (denied) return denied;

  const [{ data: devices }, { data: notis }] = await Promise.all([
    supabase
      .from("crm_onnuri_devices")
      .select("id, name, pair_code, pair_code_expires_at, source_package, paired_at, last_seen_at, revoked_at, created_at")
      .eq("center_id", ctx.centerId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_onnuri_notifications")
      .select("id, title, body, amount_won, posted_at, matched_order_id, match_note")
      .eq("center_id", ctx.centerId)
      .order("posted_at", { ascending: false })
      .limit(20),
  ]);
  const now = Date.now();
  return NextResponse.json({
    devices: (devices ?? []).map((d) => ({
      ...d,
      // 만료된 코드는 보여주지 않는다
      pair_code: d.pair_code && d.pair_code_expires_at && new Date(d.pair_code_expires_at).getTime() > now ? d.pair_code : null,
    })),
    notifications: notis ?? [],
  });
}

export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "settings.edit");
  if (denied) return denied;

  let body: { name?: string; id?: number; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const code = newPairCode();
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();

  if (body.id && body.action === "code") {
    const { data } = await supabase
      .from("crm_onnuri_devices")
      .update({ pair_code: code, pair_code_expires_at: expires } as never)
      .eq("id", Number(body.id))
      .eq("center_id", ctx.centerId)
      .is("revoked_at", null)
      .select("id");
    if ((data ?? []).length === 0) return NextResponse.json({ error: "기기를 찾을 수 없어요" }, { status: 404 });
    return NextResponse.json({ ok: true, code, expires_at: expires });
  }

  const name = String(body.name ?? "").trim().slice(0, 40) || "카운터 공기계";
  const { data, error } = await supabase
    .from("crm_onnuri_devices")
    .insert({
      center_id: ctx.centerId,
      name,
      pair_code: code,
      pair_code_expires_at: expires,
      created_by_uid: ctx.uid,
    } as never)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "onnuri.device_create",
    entity_type: "crm_onnuri_devices",
    entity_id: (data as { id: number }).id,
    payload: { name } as never,
  });
  return NextResponse.json({ ok: true, id: (data as { id: number }).id, code, expires_at: expires });
}

export async function DELETE(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "settings.edit");
  if (denied) return denied;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  await supabase
    .from("crm_onnuri_devices")
    .update({ revoked_at: new Date().toISOString(), token_hash: null, pair_code: null } as never)
    .eq("id", id)
    .eq("center_id", ctx.centerId);
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "onnuri.device_revoke",
    entity_type: "crm_onnuri_devices",
    entity_id: id,
    payload: {} as never,
  });
  return NextResponse.json({ ok: true });
}
