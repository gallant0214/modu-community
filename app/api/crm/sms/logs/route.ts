import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/sms/logs?limit= — 문자 발송 로그(성공/실패 포함).
 * 권한: messages.send. 최신순.
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

  const { data, error } = await supabase
    .from("crm_sms_logs")
    .select(
      "id, receivers, receiver_cnt, msg, msg_type, title, testmode, result_code, result_msg, success_cnt, error_cnt, sent_by_uid, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 발송자 이름 매핑
  const uids = Array.from(new Set((data ?? []).map((r) => r.sent_by_uid).filter((v): v is string => !!v)));
  const nameMap = new Map<string, string>();
  if (uids.length) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("firebase_uid, display_name")
      .eq("center_id", ctx.centerId)
      .in("firebase_uid", uids);
    for (const s of staff ?? []) nameMap.set(s.firebase_uid, s.display_name || "");
  }

  const logs = (data ?? []).map((r) => ({
    ...r,
    sent_by_name: r.sent_by_uid ? nameMap.get(r.sent_by_uid) ?? null : null,
  }));

  return NextResponse.json({ logs });
}
