import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import {
  solapiConfigured,
  solapiSend,
  solapiBalance,
  inferMsgType,
  normalizePhone,
} from "@/app/lib/solapi";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/sms/send — 솔라피 문자 발송
 * body: { receivers: string[], msg: string, title?: string, testmode?: boolean }
 * 권한: messages.send
 * testmode(기본 true): 실제 발송 없이 인증·수신자·글자수만 검증(솔라피는 native testmode 없음 → 검증만).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 문자 발송은 스페셜바디(center 1) 전용 (발신번호·크레딧 보호)
  if (ctx.centerId !== 1) {
    return NextResponse.json({ error: "현재 잠금 기능입니다." }, { status: 403 });
  }
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }
  if (!solapiConfigured()) {
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
  const testmode = body.testmode !== false; // 기본 검증(안전). 실제 발송은 명시적으로 false.

  if (receivers.length === 0) return NextResponse.json({ error: "수신번호를 입력해 주세요" }, { status: 400 });
  if (receivers.length > 1000) return NextResponse.json({ error: "한 번에 최대 1,000명까지 발송할 수 있어요" }, { status: 400 });
  if (!msg) return NextResponse.json({ error: "내용을 입력해 주세요" }, { status: 400 });

  const msgType = inferMsgType(msg);

  // 테스트(검증) 모드: 실제 발송 없이 인증만 확인
  if (testmode) {
    const bal = await solapiBalance();
    await logSms(ctx, receivers, msg, msgType, title, true, bal.ok ? 0 : -1, bal.ok ? "검증 완료" : bal.message ?? "검증 실패", 0, 0, null);
    if (!bal.ok) {
      return NextResponse.json({ error: `인증 확인 실패: ${bal.message || "설정 확인 필요"}` }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      testmode: true,
      msg_type: msgType,
      success_cnt: receivers.length,
      error_cnt: 0,
      message: `검증 완료 (실제 발송 안 함) · 잔액 ${bal.balance.toLocaleString()}원 / ${bal.point.toLocaleString()}P`,
    });
  }

  const result = await solapiSend({ receivers, msg, subject: title, msgType });

  await logSms(
    ctx,
    receivers,
    msg,
    msgType,
    title,
    false,
    result.ok ? 1 : -1,
    result.message,
    result.success,
    result.failed,
    result.groupId ?? null
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: `발송 실패: ${result.message || "솔라피 오류"}` },
      { status: 502 }
    );
  }
  return NextResponse.json({
    ok: true,
    testmode: false,
    msg_type: msgType,
    success_cnt: result.success,
    error_cnt: result.failed,
    message: result.message,
  });
}

async function logSms(
  ctx: { centerId: number; uid: string },
  receivers: string[],
  msg: string,
  msgType: string,
  title: string | undefined,
  testmode: boolean,
  resultCode: number,
  resultMsg: string,
  successCnt: number,
  errorCnt: number,
  groupId: string | null
) {
  await supabase.from("crm_sms_logs").insert({
    center_id: ctx.centerId,
    sender: process.env.SOLAPI_SENDER ?? "",
    receivers:
      receivers.slice(0, 50).join(",") + (receivers.length > 50 ? ` 외 ${receivers.length - 50}` : ""),
    receiver_cnt: receivers.length,
    msg,
    msg_type: msgType,
    title: title ?? null,
    testmode,
    result_code: resultCode,
    result_msg: resultMsg,
    success_cnt: successCnt,
    error_cnt: errorCnt,
    aligo_msg_id: groupId,
    sent_by_uid: ctx.uid,
  } as never);
}
