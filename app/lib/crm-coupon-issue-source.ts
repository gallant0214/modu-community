/**
 * 발급된 쿠폰 한 장이 '어떻게' 회원에게 갔는지 (서버 전용).
 *   send : 쿠폰 발송 화면에서 보냄 (crm_coupon_issues.send_id → crm_coupon_sends)
 *   auto : 자동 메세지가 쿠폰을 붙여 보냄 (crm_auto_message_queue.coupon_issue_id)
 *   none : 기록 없음 (초기 테스트 등)
 * 발급 내역의 '처리 내용'·'발송 내용' 칸이 쓴다.
 */
import { supabase } from "@/app/lib/supabase";
import { TRIGGER_BY_KEY } from "@/app/lib/auto-message-triggers";

export type IssueSource =
  | { kind: "send"; sendId: number; channel: string; channelLabel: string; sentByName: string | null; sentAt: string }
  | { kind: "auto"; queueId: number; triggerLabel: string; channelLabel: string; status: string; statusLabel: string; sentAt: string | null }
  | { kind: "none" };

const IN_CHUNK = 300;

export const SEND_CHANNEL_LABEL: Record<string, string> = {
  push: "앱 알림",
  sms: "문자",
  both: "앱 알림 + 문자",
  none: "알림 없이 쿠폰함에만",
};

const METHOD_LABEL: Record<string, string> = { push: "앱 알림", sms: "문자", smart: "스마트 전송" };

export const QUEUE_STATUS_LABEL: Record<string, string> = {
  pending: "발송 대기",
  sent: "발송 완료",
  failed: "발송 실패",
  skipped: "발송 안 함",
  canceled: "발송 취소",
};

export function methodsLabel(methods: unknown): string {
  const list = Array.isArray(methods) ? methods.map(String) : [];
  const labels = list.map((m) => METHOD_LABEL[m] ?? m).filter(Boolean);
  return labels.length ? labels.join(" + ") : "전송 방법 없음";
}

export async function loadIssueSources(
  centerId: number,
  issues: { id: number; sendId: number | null }[]
): Promise<Map<number, IssueSource>> {
  const out = new Map<number, IssueSource>();
  if (issues.length === 0) return out;

  // 1) 쿠폰 발송 건
  const sendIds = Array.from(new Set(issues.map((i) => i.sendId).filter((v): v is number => !!v)));
  const sends = new Map<number, { channel: string; sent_by_name: string | null; created_at: string }>();
  for (let i = 0; i < sendIds.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from("crm_coupon_sends")
      .select("id, channel, sent_by_name, created_at")
      .eq("center_id", centerId)
      .in("id", sendIds.slice(i, i + IN_CHUNK));
    for (const r of (data ?? []) as { id: number; channel: string; sent_by_name: string | null; created_at: string }[]) {
      sends.set(r.id, r);
    }
  }

  // 2) 자동 메세지 — 발송 건이 아닌 쿠폰만 대기열에서 찾는다 (1인 1장 재안내로 여러 행이면 최근 것)
  const autoIds = issues.filter((i) => !i.sendId).map((i) => i.id);
  const queue = new Map<number, { id: number; trigger_key: string; methods: unknown; status: string; sent_at: string | null }>();
  for (let i = 0; i < autoIds.length; i += IN_CHUNK) {
    const { data } = await supabase
      .from("crm_auto_message_queue")
      .select("id, coupon_issue_id, trigger_key, methods, status, sent_at")
      .eq("center_id", centerId)
      .in("coupon_issue_id", autoIds.slice(i, i + IN_CHUNK))
      .order("id", { ascending: false });
    for (const r of (data ?? []) as {
      id: number;
      coupon_issue_id: number;
      trigger_key: string;
      methods: unknown;
      status: string;
      sent_at: string | null;
    }[]) {
      if (!queue.has(r.coupon_issue_id)) queue.set(r.coupon_issue_id, r);
    }
  }

  for (const i of issues) {
    const s = i.sendId ? sends.get(i.sendId) : undefined;
    if (i.sendId && s) {
      out.set(i.id, {
        kind: "send",
        sendId: i.sendId,
        channel: s.channel,
        channelLabel: SEND_CHANNEL_LABEL[s.channel] ?? s.channel,
        sentByName: s.sent_by_name,
        sentAt: s.created_at,
      });
      continue;
    }
    const q = queue.get(i.id);
    if (q) {
      out.set(i.id, {
        kind: "auto",
        queueId: q.id,
        triggerLabel: TRIGGER_BY_KEY[q.trigger_key]?.label ?? q.trigger_key,
        channelLabel: methodsLabel(q.methods),
        status: q.status,
        statusLabel: QUEUE_STATUS_LABEL[q.status] ?? q.status,
        sentAt: q.sent_at,
      });
      continue;
    }
    out.set(i.id, { kind: "none" });
  }
  return out;
}
