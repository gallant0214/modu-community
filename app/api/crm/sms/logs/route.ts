import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/sms/logs?limit= — 메세지 전송 로그 (문자 + 앱푸시 통합, 최신순).
 * 권한: messages.send.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 100));

  // 문자(crm_sms_logs) + 앱푸시(crm_message_broadcasts) 를 각각 조회 후 병합
  const [{ data: smsRows, error: smsErr }, { data: pushRows }] = await Promise.all([
    supabase
      .from("crm_sms_logs")
      .select(
        "id, receivers, receiver_cnt, msg, msg_type, title, testmode, result_code, result_msg, success_cnt, error_cnt, sent_by_uid, created_at"
      )
      .eq("center_id", ctx.centerId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("crm_message_broadcasts")
      .select("id, title, body, recipient_count, sent_by_name, created_at")
      .eq("center_id", ctx.centerId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (smsErr) {
    return NextResponse.json({ error: "조회 실패", detail: smsErr.message }, { status: 500 });
  }

  // 문자 발송자 이름 매핑(uid → display_name)
  const uids = Array.from(
    new Set((smsRows ?? []).map((r) => r.sent_by_uid).filter((v): v is string => !!v))
  );
  const nameMap = new Map<string, string>();
  if (uids.length) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("firebase_uid, display_name")
      .eq("center_id", ctx.centerId)
      .in("firebase_uid", uids);
    for (const s of staff ?? []) nameMap.set(s.firebase_uid, s.display_name || "");
  }

  type LogItem = {
    key: string;
    channel: "sms" | "push";
    title: string | null;
    content: string;
    receiver_cnt: number;
    msg_type: string | null;
    testmode: boolean;
    result_code: number | null;
    result_msg: string | null;
    success_cnt: number | null;
    error_cnt: number | null;
    read_count: number | null;
    sent_by_name: string | null;
    created_at: string;
  };

  const smsItems: LogItem[] = (smsRows ?? []).map((r) => ({
    key: `sms-${r.id}`,
    channel: "sms",
    title: r.title ?? null,
    content: r.msg ?? "",
    receiver_cnt: r.receiver_cnt ?? 0,
    msg_type: r.msg_type ?? null,
    testmode: !!r.testmode,
    result_code: r.result_code ?? null,
    result_msg: r.result_msg ?? null,
    success_cnt: r.success_cnt ?? null,
    error_cnt: r.error_cnt ?? null,
    read_count: null,
    sent_by_name: r.sent_by_uid ? nameMap.get(r.sent_by_uid) ?? null : null,
    created_at: r.created_at,
  }));

  const pushItems: LogItem[] = (pushRows ?? []).map((b) => ({
    key: `push-${b.id}`,
    channel: "push",
    title: b.title ?? null,
    content: b.body ?? "",
    receiver_cnt: b.recipient_count ?? 0,
    msg_type: null,
    testmode: false,
    result_code: null,
    result_msg: null,
    success_cnt: null,
    error_cnt: null,
    read_count: null,
    sent_by_name: b.sent_by_name ?? null,
    created_at: b.created_at,
  }));

  const logs = [...smsItems, ...pushItems]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, limit);

  return NextResponse.json({ logs });
}
