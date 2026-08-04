import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { notifyMembersByIds } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/messages
 * 지난 발송 이력 목록 (최신순). 각 broadcast 의 수신자 수/읽음 카운트 포함.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_message_broadcasts")
    .select(
      "id, title, body, audience_kind, audience_filter, recipient_count, sent_by_name, sent_by_uid, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 각 broadcast 의 읽음 카운트
  const ids = (data ?? []).map((b) => b.id);
  const readCounts = new Map<number, number>();
  if (ids.length) {
    const { data: reads } = await supabase
      .from("crm_message_recipients")
      .select("broadcast_id")
      .in("broadcast_id", ids)
      .eq("status", "read");
    for (const r of reads ?? []) {
      readCounts.set(r.broadcast_id, (readCounts.get(r.broadcast_id) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    broadcasts: (data ?? []).map((b) => ({
      ...b,
      read_count: readCounts.get(b.id) ?? 0,
    })),
  });
}

/**
 * POST /api/crm/messages
 * body: {
 *   title, body,
 *   audience_kind: 'all' | 'active' | 'expiring' | 'expired' | 'unassigned' | 'individual',
 *   member_ids?: number[]   // audience_kind='individual' 일 때
 *   within_days?: number    // audience_kind='expiring' 일 때 (기본 7)
 * }
 *
 * 처리:
 *  1) audience_kind 로 수신자 member_id 목록 계산
 *  2) crm_message_broadcasts 1행 insert
 *  3) crm_message_recipients 에 fan-out (status='pending')
 *
 * trainer 는 발송 금지 (owner/admin/manager).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  let body: {
    title?: string;
    body?: string;
    audience_kind?: string;
    member_ids?: number[];
    within_days?: number;
    inactive_days?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const title = body.title?.trim();
  const bodyText = body.body?.trim();
  const kind = body.audience_kind ?? "";

  if (!title) return NextResponse.json({ error: "제목을 입력해 주세요" }, { status: 400 });
  if (!bodyText) return NextResponse.json({ error: "내용을 입력해 주세요" }, { status: 400 });
  if (title.length > 60) return NextResponse.json({ error: "제목은 60자 이내로 입력해 주세요" }, { status: 400 });
  if (bodyText.length > 2000) return NextResponse.json({ error: "내용은 2000자 이내로 입력해 주세요" }, { status: 400 });

  const validKinds = ["all", "active", "expiring", "expired", "unassigned", "individual", "dormant"];
  if (!validKinds.includes(kind)) {
    return NextResponse.json({ error: "대상 유형이 잘못됨" }, { status: 400 });
  }

  const withinDays = Math.max(1, Math.min(60, body.within_days ?? 7));
  const inactiveDays = Math.max(1, Math.min(365, body.inactive_days ?? 14));
  const memberIds = await resolveAudience(ctx.centerId, kind, {
    member_ids: body.member_ids ?? [],
    within_days: withinDays,
    inactive_days: inactiveDays,
  });

  if (memberIds.length === 0) {
    return NextResponse.json(
      { error: "받을 회원이 없어요. 대상을 확인해 주세요." },
      { status: 400 }
    );
  }

  const audienceFilter =
    kind === "individual"
      ? { member_ids: body.member_ids ?? [] }
      : kind === "expiring"
      ? { within_days: withinDays }
      : kind === "dormant"
      ? { inactive_days: inactiveDays }
      : null;

  // 발송자 이름 조회 (스냅샷)
  const { data: sender } = await supabase
    .from("crm_center_members")
    .select("display_name")
    .eq("center_id", ctx.centerId)
    .eq("firebase_uid", ctx.uid)
    .maybeSingle();

  const { data: broadcast, error: bErr } = await supabase
    .from("crm_message_broadcasts")
    .insert({
      center_id: ctx.centerId,
      title,
      body: bodyText,
      audience_kind: kind,
      audience_filter: audienceFilter as never,
      recipient_count: memberIds.length,
      sent_by_uid: ctx.uid,
      sent_by_name: sender?.display_name ?? null,
    } as never)
    .select("id")
    .single();

  if (bErr || !broadcast) {
    return NextResponse.json(
      { error: "발송 실패", detail: bErr?.message },
      { status: 500 }
    );
  }

  // fan-out (배치 insert)
  const rows = memberIds.map((mid) => ({
    broadcast_id: broadcast.id,
    center_id: ctx.centerId,
    member_id: mid,
    status: "pending",
  }));

  // Postgres insert 한 번에 대량은 무리. 500씩 나눠서.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error: rErr } = await supabase
      .from("crm_message_recipients")
      .insert(chunk as never);
    if (rErr) {
      // 실패 시 broadcast 롤백 시도 (best-effort)
      await supabase.from("crm_message_broadcasts").delete().eq("id", broadcast.id);
      return NextResponse.json(
        { error: "수신자 저장 실패", detail: rErr.message },
        { status: 500 }
      );
    }
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "message.broadcast",
    entity_type: "crm_message_broadcasts",
    entity_id: broadcast.id,
    payload: {
      audience_kind: kind,
      recipient_count: memberIds.length,
    } as never,
  });

  // 회원 앱 알림(푸시 + 알림함) — 백그라운드 발송
  after(async () => {
    await notifyMembersByIds(ctx.centerId, memberIds, "message", title, bodyText, {
      broadcastId: String(broadcast.id),
    });
  });

  return NextResponse.json({
    ok: true,
    broadcast_id: broadcast.id,
    recipient_count: memberIds.length,
  });
}

/**
 * audience_kind 별 회원 ID 목록 계산.
 * 오늘 KST 기준 만료일 비교.
 */
export async function resolveAudience(
  centerId: number,
  kind: string,
  opts: { member_ids?: number[]; within_days?: number; inactive_days?: number }
): Promise<number[]> {
  const today = kstYmd();

  if (kind === "individual") {
    const ids = (opts.member_ids ?? []).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];
    // 소속 검증
    const { data } = await supabase
      .from("crm_members")
      .select("id")
      .eq("center_id", centerId)
      .eq("status", "active")
      .in("id", ids);
    return (data ?? []).map((m) => m.id);
  }

  // 전체 active 회원 base — 1000행 상한 우회(paginateAll)
  const allMembers = await paginateAll<{ id: number; last_attended_at: string | null }>((f, t) =>
    supabase
      .from("crm_members")
      .select("id, last_attended_at")
      .eq("center_id", centerId)
      .eq("status", "active")
      .range(f, t)
  );
  const allIds = new Set(allMembers.map((m) => m.id));

  if (kind === "all") return Array.from(allIds);

  // 활성/만료 판단: passes + memberships 조합 (둘 다 paginateAll)
  const [passRows, memRows] = await Promise.all([
    paginateAll<{ member_id: number; expires_at: string }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("member_id, expires_at")
        .eq("center_id", centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
    paginateAll<{ member_id: number; expires_at: string }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("member_id, expires_at")
        .eq("center_id", centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
  ]);

  const withinDays = opts.within_days ?? 7;
  const cutoff = addDays(today, withinDays);

  const activeIds = new Set<number>();
  const expiringIds = new Set<number>();
  const validMemberIds = new Set<number>();
  for (const r of [...passRows, ...memRows]) {
    validMemberIds.add(r.member_id);
    if (r.expires_at >= today) {
      activeIds.add(r.member_id);
      if (r.expires_at <= cutoff) expiringIds.add(r.member_id);
    }
  }

  if (kind === "active") return Array.from(activeIds).filter((id) => allIds.has(id));
  if (kind === "expiring") return Array.from(expiringIds).filter((id) => allIds.has(id));

  if (kind === "dormant") {
    // 유효 회원(활성 상품 보유) 중 장기 미출석 — 마지막 출석이 inactive_days 이전이거나 출석 이력 없음
    const inactiveDays = opts.inactive_days ?? 14;
    const cutoffDate = addDays(today, -inactiveDays);

    // 마지막 출석일 = max(crm_attendances.checked_in_at, crm_members.last_attended_at)
    const attRows = await paginateAll<{ member_id: number; checked_in_at: string }>((f, t) =>
      supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .eq("center_id", centerId)
        .range(f, t)
    );
    const lastAtt = new Map<number, string>();
    const bump = (mid: number, ymd: string) => {
      const prev = lastAtt.get(mid);
      if (!prev || ymd > prev) lastAtt.set(mid, ymd);
    };
    for (const a of attRows) {
      if (a.checked_in_at) bump(a.member_id, toKstYmd(a.checked_in_at));
    }
    for (const m of allMembers) {
      if (m.last_attended_at) bump(m.id, m.last_attended_at.slice(0, 10));
    }

    // 활성 상품 보유(유효 회원)면서 마지막 출석이 cutoff 이전(또는 이력 없음)
    return Array.from(activeIds).filter((id) => {
      if (!allIds.has(id)) return false;
      const last = lastAtt.get(id);
      return !last || last < cutoffDate;
    });
  }

  if (kind === "expired") {
    // 활성 상품 없는 회원만
    const expired = Array.from(allIds).filter((id) => !activeIds.has(id) && validMemberIds.has(id));
    return expired;
  }

  if (kind === "unassigned") {
    // 활성 회원이지만 pass/membership 이력 자체가 없는 사람
    return Array.from(allIds).filter((id) => !validMemberIds.has(id));
  }

  return [];
}

function kstYmd(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** timestamptz(또는 date) 문자열 → KST YYYY-MM-DD */
function toKstYmd(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** PostgREST 1000행 상한 우회 — range 로 전량 페이지네이션 */
async function paginateAll<T>(
  build: (from: number, to: number) => { then: (fn: (r: unknown) => void) => unknown },
  chunk = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const to = from + chunk - 1;
    const res = (await build(from, to)) as { data: T[] | null; error: unknown };
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}
