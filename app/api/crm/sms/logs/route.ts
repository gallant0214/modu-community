import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const AUDIENCE_LABEL: Record<string, string> = {
  all: "전체 회원",
  active: "유효 회원",
  expiring: "만료 임박 회원",
  expired: "만료 회원",
  unassigned: "미배정 회원",
  individual: "개별",
};

function digitsOnly(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}
function hyphenate(d: string): string {
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

/**
 * GET /api/crm/sms/logs?before=ISO — 메세지 전송 로그 (문자 + 앱푸시 통합, 최신순, 누적).
 *   - 수신자(recipient_label)·발송 직원(sent_by_name) 포함.
 *   - before(created_at) 커서 기반 페이지네이션(40건씩). next_cursor 로 '더 보기'.
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
  const before = url.searchParams.get("before"); // ISO timestamp (이 시각 이전 것)

  let smsQ = supabase
    .from("crm_sms_logs")
    .select(
      "id, receivers, receiver_cnt, msg, msg_type, title, testmode, result_code, result_msg, success_cnt, error_cnt, sent_by_uid, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  let pushQ = supabase
    .from("crm_message_broadcasts")
    .select("id, title, body, audience_kind, audience_filter, recipient_count, sent_by_name, created_at")
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) {
    smsQ = smsQ.lt("created_at", before);
    pushQ = pushQ.lt("created_at", before);
  }

  const [{ data: smsRows, error: smsErr }, { data: pushRows }] = await Promise.all([smsQ, pushQ]);
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

  // 단건 문자 수신번호 → 회원 이름 매핑 (연락처로 회원 조회)
  const singlePhones = Array.from(
    new Set(
      (smsRows ?? [])
        .filter((r) => (r.receiver_cnt ?? 0) === 1)
        .map((r) => digitsOnly(r.receivers))
        .filter(Boolean)
    )
  );
  const memberByPhone = new Map<string, string>(); // digits -> name
  if (singlePhones.length) {
    const candidates = Array.from(new Set(singlePhones.flatMap((d) => [d, hyphenate(d)])));
    const { data: mems } = await supabase
      .from("crm_members")
      .select("name, phone")
      .eq("center_id", ctx.centerId)
      .in("phone", candidates);
    for (const mm of (mems ?? []) as { name: string; phone: string | null }[]) {
      const d = digitsOnly(mm.phone);
      if (d) memberByPhone.set(d, mm.name);
    }
  }

  type LogItem = {
    key: string;
    channel: "sms" | "push";
    title: string | null;
    content: string;
    recipient_label: string;
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

  const smsItems: LogItem[] = (smsRows ?? []).map((r) => {
    const cnt = r.receiver_cnt ?? 0;
    let recipient: string;
    if (cnt === 1) {
      const d = digitsOnly(r.receivers);
      recipient = memberByPhone.get(d) ?? hyphenate(d);
    } else {
      recipient = `${cnt}명`;
    }
    return {
      key: `sms-${r.id}`,
      channel: "sms",
      title: r.title ?? null,
      content: r.msg ?? "",
      recipient_label: recipient,
      receiver_cnt: cnt,
      msg_type: r.msg_type ?? null,
      testmode: !!r.testmode,
      result_code: r.result_code ?? null,
      result_msg: r.result_msg ?? null,
      success_cnt: r.success_cnt ?? null,
      error_cnt: r.error_cnt ?? null,
      read_count: null,
      sent_by_name: r.sent_by_uid ? nameMap.get(r.sent_by_uid) ?? null : null,
      created_at: r.created_at,
    };
  });

  const pushItems: LogItem[] = (pushRows ?? []).map((b) => {
    const kind = (b as { audience_kind?: string }).audience_kind ?? "all";
    const cnt = b.recipient_count ?? 0;
    let recipient: string;
    if (kind === "individual") {
      const f = (b as { audience_filter?: { member_name?: string | null } | null }).audience_filter;
      recipient = f?.member_name || "개별 회원";
    } else {
      recipient = `${AUDIENCE_LABEL[kind] ?? kind}${cnt ? ` ${cnt}명` : ""}`;
    }
    return {
      key: `push-${b.id}`,
      channel: "push",
      title: b.title ?? null,
      content: b.body ?? "",
      recipient_label: recipient,
      receiver_cnt: cnt,
      msg_type: null,
      testmode: false,
      result_code: null,
      result_msg: null,
      success_cnt: null,
      error_cnt: null,
      read_count: null,
      sent_by_name: b.sent_by_name ?? null,
      created_at: b.created_at,
    };
  });

  const merged = [...smsItems, ...pushItems].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  );
  const logs = merged.slice(0, PAGE_SIZE);
  // 두 소스 각각 PAGE_SIZE 를 채웠고 합쳐서 PAGE_SIZE 이상이면 다음 페이지 존재 가능
  const nextCursor =
    logs.length === PAGE_SIZE ? logs[logs.length - 1].created_at : null;

  return NextResponse.json({ logs, next_cursor: nextCursor });
}
