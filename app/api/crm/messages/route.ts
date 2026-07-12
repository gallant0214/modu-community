import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

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

  const validKinds = ["all", "active", "expiring", "expired", "unassigned", "individual"];
  if (!validKinds.includes(kind)) {
    return NextResponse.json({ error: "대상 유형이 잘못됨" }, { status: 400 });
  }

  const withinDays = Math.max(1, Math.min(60, body.within_days ?? 7));
  const memberIds = await resolveAudience(ctx.centerId, kind, {
    member_ids: body.member_ids ?? [],
    within_days: withinDays,
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
  opts: { member_ids?: number[]; within_days?: number }
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

  // 전체 active 회원 base
  const { data: allMembers } = await supabase
    .from("crm_members")
    .select("id")
    .eq("center_id", centerId)
    .eq("status", "active");
  const allIds = new Set((allMembers ?? []).map((m) => m.id));

  if (kind === "all") return Array.from(allIds);

  // 활성/만료 판단: passes + memberships 조합
  const [passRes, memRes] = await Promise.all([
    supabase
      .from("crm_passes")
      .select("member_id, expires_at, status")
      .eq("center_id", centerId)
      .eq("status", "valid"),
    supabase
      .from("crm_memberships")
      .select("member_id, expires_at, status")
      .eq("center_id", centerId)
      .eq("status", "valid"),
  ]);

  const withinDays = opts.within_days ?? 7;
  const cutoff = addDays(today, withinDays);

  const activeIds = new Set<number>();
  const expiringIds = new Set<number>();
  const validMemberIds = new Set<number>();
  for (const r of [...(passRes.data ?? []), ...(memRes.data ?? [])]) {
    validMemberIds.add(r.member_id);
    if (r.expires_at >= today) {
      activeIds.add(r.member_id);
      if (r.expires_at <= cutoff) expiringIds.add(r.member_id);
    }
  }

  if (kind === "active") return Array.from(activeIds).filter((id) => allIds.has(id));
  if (kind === "expiring") return Array.from(expiringIds).filter((id) => allIds.has(id));

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

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
