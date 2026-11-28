import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { SMS_NOT_READY_MESSAGE, smsAllowedForCenter } from "@/app/lib/crm-sms-availability";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { TRIGGER_BY_KEY } from "@/app/lib/auto-message-triggers";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
/** 기록 하나에서 이름을 펼쳐 보여줄 최대 인원 (문자 기록은 수신번호를 50개까지만 남긴다) */
const RECIPIENT_LIST_MAX = 50;

const AUDIENCE_LABEL: Record<string, string> = {
  all: "전체 회원",
  active: "유효 회원",
  expiring: "만료 임박 회원",
  expired: "만료 회원",
  unassigned: "미배정 회원",
  individual: "개별",
  auto: "자동 메세지",
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
 * GET /api/crm/sms/logs?before=ISO&filter= — 메세지 전송 로그 (문자 + 앱푸시 통합, 최신순, 누적).
 *   - filter: (없음)=전체 · manual=직접 발송 · auto=자동 메세지 전부 · auto:<트리거키>=그 자동 메세지만
 *   - 수신자(recipient_label)·발송 직원(sent_by_name) 포함.
 *   - before(created_at) 커서 기반 페이지네이션(40건씩). next_cursor 로 '더 보기'.
 * 권한: messages.send.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!smsAllowedForCenter(ctx.centerId)) {
    return NextResponse.json({ error: SMS_NOT_READY_MESSAGE }, { status: 403 });
  }
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const before = url.searchParams.get("before"); // ISO timestamp (이 시각 이전 것)
  const filter = (url.searchParams.get("filter") ?? "").trim();
  const filterTrigger = filter.startsWith("auto:") ? filter.slice(5) : null;
  if (filterTrigger !== null && !TRIGGER_BY_KEY[filterTrigger]) {
    return NextResponse.json({ error: "알 수 없는 자동 메세지예요" }, { status: 400 });
  }

  let smsQ = supabase
    .from("crm_sms_logs")
    .select(
      "id, receivers, receiver_cnt, msg, msg_type, title, testmode, result_code, result_msg, success_cnt, error_cnt, sent_by_uid, auto_trigger_key, created_at"
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
  // 종류별 필터 — 문자는 auto_trigger_key, 앱푸시는 audience_kind='auto' + audience_filter.trigger_key
  if (filter === "manual") {
    smsQ = smsQ.is("auto_trigger_key", null);
    pushQ = pushQ.neq("audience_kind", "auto");
  } else if (filter === "auto") {
    smsQ = smsQ.not("auto_trigger_key", "is", null);
    pushQ = pushQ.eq("audience_kind", "auto");
  } else if (filterTrigger) {
    smsQ = smsQ.eq("auto_trigger_key", filterTrigger);
    pushQ = pushQ.eq("audience_kind", "auto").eq("audience_filter->>trigger_key", filterTrigger);
  }

  const [{ data: smsRows, error: smsErr }, { data: pushRows }] = await Promise.all([smsQ, pushQ]);
  if (smsErr) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(smsErr) }, { status: 500 });
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

  // 받는 사람 이름 — 문자는 수신번호로 회원을 찾고, 앱푸시는 발송 기록의 회원 id(없으면 수신 목록)로 찾는다.
  //  한 기록당 RECIPIENT_LIST_MAX 명까지만 이름을 펼쳐 보여주고 나머지는 '외 N명'.
  const smsPhonesByRow = new Map<number, string[]>();
  for (const r of smsRows ?? []) {
    const phones = String(r.receivers ?? "")
      .split(",")
      .map((x) => digitsOnly(x.split(" 외")[0]))
      .filter((d) => d.length >= 9)
      .slice(0, RECIPIENT_LIST_MAX);
    smsPhonesByRow.set(r.id, phones);
  }
  const allPhones = Array.from(new Set(Array.from(smsPhonesByRow.values()).flat()));
  const memberByPhone = new Map<string, { id: number; name: string }>(); // digits -> 회원
  const PHONE_CHUNK = 150;
  for (let i = 0; i < allPhones.length; i += PHONE_CHUNK) {
    const chunk = allPhones.slice(i, i + PHONE_CHUNK);
    const candidates = Array.from(new Set(chunk.flatMap((d) => [d, hyphenate(d)])));
    const { data: mems } = await supabase
      .from("crm_members")
      .select("id, name, phone, status")
      .eq("center_id", ctx.centerId)
      .in("phone", candidates);
    // 같은 번호가 여럿이면 활성 회원을 우선
    const sorted = ((mems ?? []) as { id: number; name: string; phone: string | null; status: string | null }[]).sort(
      (a, b) => Number(a.status === "active") - Number(b.status === "active")
    );
    for (const mm of sorted) {
      const d = digitsOnly(mm.phone);
      if (d) memberByPhone.set(d, { id: mm.id, name: mm.name });
    }
  }

  // 앱푸시: audience_filter.member_ids / member_id → 없으면 수신 목록(crm_message_recipients)
  const pushIdsByRow = new Map<number, number[]>();
  const needRecipientRows: number[] = [];
  for (const b of pushRows ?? []) {
    const f = ((b as { audience_filter?: unknown }).audience_filter ?? {}) as {
      member_ids?: unknown;
      member_id?: unknown;
    };
    const ids = Array.isArray(f.member_ids)
      ? f.member_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : Number(f.member_id) > 0
        ? [Number(f.member_id)]
        : [];
    if (ids.length) pushIdsByRow.set(b.id, ids.slice(0, RECIPIENT_LIST_MAX));
    else if ((b.recipient_count ?? 0) > 0) needRecipientRows.push(b.id);
  }
  await Promise.all(
    needRecipientRows.map(async (bid) => {
      const { data } = await supabase
        .from("crm_message_recipients")
        .select("member_id")
        .eq("broadcast_id", bid)
        .eq("center_id", ctx.centerId)
        .order("created_at", { ascending: true })
        .limit(RECIPIENT_LIST_MAX);
      pushIdsByRow.set(
        bid,
        (data ?? []).map((r) => Number((r as { member_id: number }).member_id)).filter((n) => n > 0)
      );
    })
  );
  const allIds = Array.from(new Set(Array.from(pushIdsByRow.values()).flat()));
  const memberById = new Map<number, string>();
  const ID_CHUNK = 300;
  for (let i = 0; i < allIds.length; i += ID_CHUNK) {
    const { data: mems } = await supabase
      .from("crm_members")
      .select("id, name")
      .eq("center_id", ctx.centerId)
      .in("id", allIds.slice(i, i + ID_CHUNK));
    for (const mm of (mems ?? []) as { id: number; name: string }[]) memberById.set(mm.id, mm.name);
  }

  type Recipient = { member_id: number | null; name: string | null; phone: string | null };
  /** 요약 줄 — 1~3명은 이름 전부, 그 이상은 '앞 3명 외 N명' */
  const summarize = (list: Recipient[], total: number): string => {
    const names = list.slice(0, 3).map((r) => r.name || (r.phone ? hyphenate(r.phone) : "알 수 없음"));
    if (!names.length) return total ? `${total}명` : "—";
    const rest = Math.max(0, total - names.length);
    return rest > 0 ? `${names.join(", ")} 외 ${rest}명` : names.join(", ");
  };

  type LogItem = {
    key: string;
    channel: "sms" | "push";
    title: string | null;
    content: string;
    recipient_label: string;
    /** 받는 사람 목록(최대 RECIPIENT_LIST_MAX) — 펼쳤을 때 보여준다 */
    recipients: Recipient[];
    receiver_cnt: number;
    msg_type: string | null;
    testmode: boolean;
    result_code: number | null;
    result_msg: string | null;
    success_cnt: number | null;
    error_cnt: number | null;
    read_count: number | null;
    sent_by_name: string | null;
    /** 자동 메세지면 트리거 키·이름 (직접 발송은 null) */
    auto_trigger_key: string | null;
    auto_label: string | null;
    created_at: string;
  };
  const autoLabel = (key: string | null | undefined) =>
    key ? TRIGGER_BY_KEY[key]?.label ?? key : null;

  const smsItems: LogItem[] = (smsRows ?? []).map((r) => {
    const cnt = r.receiver_cnt ?? 0;
    const recipients: Recipient[] = (smsPhonesByRow.get(r.id) ?? []).map((d) => {
      const m = memberByPhone.get(d);
      return { member_id: m?.id ?? null, name: m?.name ?? null, phone: d };
    });
    const recipient = summarize(recipients, cnt);
    return {
      key: `sms-${r.id}`,
      channel: "sms",
      title: r.title ?? null,
      content: r.msg ?? "",
      recipient_label: recipient,
      recipients,
      receiver_cnt: cnt,
      msg_type: r.msg_type ?? null,
      testmode: !!r.testmode,
      result_code: r.result_code ?? null,
      result_msg: r.result_msg ?? null,
      success_cnt: r.success_cnt ?? null,
      error_cnt: r.error_cnt ?? null,
      read_count: null,
      sent_by_name: r.auto_trigger_key
        ? "자동 메세지"
        : r.sent_by_uid
          ? nameMap.get(r.sent_by_uid) ?? null
          : null,
      auto_trigger_key: r.auto_trigger_key ?? null,
      auto_label: autoLabel(r.auto_trigger_key),
      created_at: r.created_at,
    };
  });

  const pushItems: LogItem[] = (pushRows ?? []).map((b) => {
    const kind = (b as { audience_kind?: string }).audience_kind ?? "all";
    const cnt = b.recipient_count ?? 0;
    const f = (b as { audience_filter?: { member_name?: string | null; trigger_key?: string | null } | null })
      .audience_filter;
    const pushTrigger = kind === "auto" ? f?.trigger_key ?? null : null;
    const recipients: Recipient[] = (pushIdsByRow.get(b.id) ?? []).map((id) => ({
      member_id: id,
      name: memberById.get(id) ?? (cnt === 1 ? f?.member_name ?? null : null),
      phone: null,
    }));
    // 개별·자동 발송은 받은 회원 이름으로, 그룹 발송(전체·유효 회원 등)은 그룹 이름 + 인원
    const recipient =
      kind === "individual" || kind === "auto"
        ? recipients.length
          ? summarize(recipients, cnt)
          : f?.member_name || `${cnt}명`
        : `${AUDIENCE_LABEL[kind] ?? kind}${cnt ? ` ${cnt}명` : ""}`;
    return {
      key: `push-${b.id}`,
      channel: "push",
      title: b.title ?? null,
      content: b.body ?? "",
      recipient_label: recipient,
      recipients,
      receiver_cnt: cnt,
      msg_type: null,
      testmode: false,
      result_code: null,
      result_msg: null,
      success_cnt: null,
      error_cnt: null,
      read_count: null,
      sent_by_name: b.sent_by_name ?? null,
      auto_trigger_key: pushTrigger,
      auto_label: autoLabel(pushTrigger),
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
