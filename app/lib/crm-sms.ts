import { supabase } from "@/app/lib/supabase";
import { solapiConfigured, solapiSend, inferMsgType, normalizePhone } from "@/app/lib/solapi";

/**
 * CRM 문자 발송 공용 헬퍼.
 * `/api/crm/sms/send`(수동 발송)와 자동 메세지(자동 발송·테스트 발송)가 함께 쓴다.
 * 발송 결과는 항상 crm_sms_logs 에 남긴다.
 */

/** 문자 발송은 스페셜바디(center 1) 전용 — 발신번호·크레딧 보호 */
export const SMS_ENABLED_CENTER_IDS = new Set<number>([1]);

export function smsAllowedForCenter(centerId: number): boolean {
  return SMS_ENABLED_CENTER_IDS.has(centerId);
}

export interface CrmSmsResult {
  ok: boolean;
  sent: number;
  failed: number;
  message: string;
}

/**
 * 회원 id 목록 중 **앱 푸시를 받을 수 있는 회원** 집합.
 * 기준 = 등록된 기기 토큰이 있는지 (앱 설치 + 로그인 상태).
 * '스마트 전송'이 푸시/문자를 가르는 판정에 쓴다.
 */
export async function loadPushableMembers(
  centerId: number,
  memberIds: number[]
): Promise<Set<number>> {
  const out = new Set<number>();
  if (memberIds.length === 0) return out;
  // 회원이 다른 센터로도 연동돼 있을 수 있어 uid 기준 토큰도 함께 본다.
  const uidByMember = new Map<string, number>();
  for (let i = 0; i < memberIds.length; i += 500) {
    const chunk = memberIds.slice(i, i + 500);
    const { data } = await supabase
      .from("crm_members")
      .select("id, linked_firebase_uid")
      .eq("center_id", centerId)
      .in("id", chunk);
    for (const m of data ?? []) {
      const uid = (m as { linked_firebase_uid?: string | null }).linked_firebase_uid;
      if (uid) uidByMember.set(uid, m.id);
    }
    const { data: byMember } = await supabase
      .from("crm_member_device_tokens")
      .select("member_id")
      .in("member_id", chunk);
    for (const t of byMember ?? []) out.add(t.member_id);
  }
  const uids = Array.from(uidByMember.keys());
  for (let i = 0; i < uids.length; i += 500) {
    const { data } = await supabase
      .from("crm_member_device_tokens")
      .select("firebase_uid")
      .in("firebase_uid", uids.slice(i, i + 500));
    for (const t of data ?? []) {
      const id = uidByMember.get(t.firebase_uid);
      if (id) out.add(id);
    }
  }
  return out;
}

/** 회원 id 목록 → 휴대폰 번호 (번호 없는 회원은 제외) */
export async function loadMemberPhones(
  centerId: number,
  memberIds: number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (memberIds.length === 0) return out;
  for (let i = 0; i < memberIds.length; i += 500) {
    const chunk = memberIds.slice(i, i + 500);
    const { data } = await supabase
      .from("crm_members")
      .select("id, phone")
      .eq("center_id", centerId)
      .in("id", chunk);
    for (const m of data ?? []) {
      const p = normalizePhone(String(m.phone ?? ""));
      if (p) out.set(m.id, p);
    }
  }
  return out;
}

/**
 * 실제 문자 발송 + 로그 기록.
 * 같은 문구를 여러 명에게 보낼 때 사용(솔라피 단체 발송).
 */
export async function sendCrmSms(opts: {
  centerId: number;
  uid: string;
  receivers: string[];
  msg: string;
  title?: string;
  /** 로그 구분용 (예: "자동메세지", "테스트발송") */
  tag?: string;
}): Promise<CrmSmsResult> {
  const receivers = Array.from(
    new Set(opts.receivers.map((r) => normalizePhone(String(r))).filter(Boolean))
  );
  const msg = (opts.msg ?? "").trim();
  if (receivers.length === 0) return { ok: false, sent: 0, failed: 0, message: "수신번호가 없습니다" };
  if (!msg) return { ok: false, sent: 0, failed: 0, message: "내용이 비어 있습니다" };
  if (!solapiConfigured()) {
    return { ok: false, sent: 0, failed: receivers.length, message: "문자 발송 설정이 완료되지 않았습니다" };
  }

  const msgType = inferMsgType(msg);
  const result = await solapiSend({ receivers, msg, subject: opts.title, msgType });

  try {
    await supabase.from("crm_sms_logs").insert({
      center_id: opts.centerId,
      sender: process.env.SOLAPI_SENDER ?? "",
      receivers: receivers.join(","),
      receiver_cnt: receivers.length,
      msg,
      msg_type: msgType,
      title: opts.tag ? `[${opts.tag}] ${opts.title ?? ""}`.trim() : opts.title ?? null,
      testmode: false,
      result_code: result.ok ? 1 : -1,
      result_msg: result.message,
      success_cnt: result.success,
      error_cnt: result.failed,
      aligo_msg_id: result.groupId ?? null,
      sent_by_uid: opts.uid,
    } as never);
  } catch {
    /* 로그 실패해도 발송 결과는 그대로 반환 */
  }

  return {
    ok: result.ok,
    sent: result.success,
    failed: result.failed,
    message: result.message,
  };
}
