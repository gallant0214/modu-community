import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { aligoConfigured, aligoSend, inferMsgType, normalizePhone } from "@/app/lib/aligo";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/sms/send — 알리고 문자 발송
 * body: { receivers: string[], msg: string, title?: string, testmode?: boolean }
 * 권한: messages.send
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }
  if (!aligoConfigured()) {
    return NextResponse.json(
      { error: "문자 발송 설정이 완료되지 않았습니다(관리자 환경변수 확인)" },
      { status: 503 }
    );
  }

  let body: { receivers?: unknown; msg?: string; title?: string; testmode?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const receivers = Array.isArray(body.receivers)
    ? Array.from(new Set(body.receivers.map((r) => normalizePhone(String(r))).filter(Boolean)))
    : [];
  const msg = (body.msg ?? "").trim();
  const title = (body.title ?? "").trim() || undefined;
  const testmode = body.testmode !== false; // 기본 테스트모드(안전). 실제 발송은 명시적으로 false.

  if (receivers.length === 0) return NextResponse.json({ error: "수신번호를 입력해 주세요" }, { status: 400 });
  if (receivers.length > 1000) return NextResponse.json({ error: "한 번에 최대 1,000명까지 발송할 수 있어요" }, { status: 400 });
  if (!msg) return NextResponse.json({ error: "내용을 입력해 주세요" }, { status: 400 });

  const msgType = inferMsgType(msg);

  const result = await aligoSend({ receivers, msg, title, msgType, testmode });

  // 발송 이력 저장(요약)
  await supabase.from("crm_sms_logs").insert({
    center_id: ctx.centerId,
    sender: process.env.ALIGO_SENDER ?? "",
    receivers: receivers.slice(0, 50).join(",") + (receivers.length > 50 ? ` 외 ${receivers.length - 50}` : ""),
    receiver_cnt: receivers.length,
    msg,
    msg_type: result.msg_type ?? msgType,
    title: title ?? null,
    testmode,
    result_code: result.result_code,
    result_msg: result.message,
    success_cnt: result.success_cnt ?? null,
    error_cnt: result.error_cnt ?? null,
    aligo_msg_id: result.msg_id != null ? String(result.msg_id) : null,
    sent_by_uid: ctx.uid,
  } as never);

  if (!result.ok) {
    return NextResponse.json(
      { error: `발송 실패: ${result.message || "알리고 오류"}`, result_code: result.result_code },
      { status: 502 }
    );
  }
  return NextResponse.json({
    ok: true,
    testmode,
    msg_type: result.msg_type ?? msgType,
    success_cnt: result.success_cnt ?? receivers.length,
    error_cnt: result.error_cnt ?? 0,
    message: result.message,
  });
}
