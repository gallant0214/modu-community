import "server-only";
import { supabase } from "@/app/lib/supabase";

/**
 * 환불된 결제의 **발급물을 회수**한다 (2026-09-24 사용자 확정 정책).
 *
 * 결제내역의 '삭제' 버튼을 없애고 '환불'로 일원화하면서 생긴 함수다.
 * 삭제는 결제 기록까지 통째로 지워 원장이 사라졌다. 여기서는 기록을 남기고 이용권만 회수한다.
 *
 * 순서가 중요하다:
 *   1) 상품명을 결제원장에 스냅샷 (회수 후에도 무엇에 대한 결제였는지 남도록)
 *   2) 락커 대여권이면 락커를 이전 상태로 원복
 *   3) 결제원장에서 상품 연결을 **먼저 끊는다**
 *      — 안 끊고 지우면 crm_payments 가 ON DELETE CASCADE 로 함께 사라진다
 *   4) 상품 삭제
 */

export type RetireKind = "membership" | "pass" | "rental" | null;

export interface RetireResult {
  ok: boolean;
  kind: RetireKind;
  /** 회수한 상품 이름 (로그·화면 표시용) */
  label: string | null;
  /** 락커 처리 결과 */
  locker?: { returned: number; reverted: number };
  error?: string;
}

/** 이 대여권이 락커인지 — 결제 삭제 로직과 같은 기준 */
function isLockerRental(r: { item_name: string | null; memo: string | null }): boolean {
  const memo = r.memo ?? "";
  const name = (r.item_name ?? "").trim();
  return (
    memo.includes("미배정") ||
    /\d+번/.test(memo) ||
    memo.includes("락커") ||
    /^(락커|상가)/.test(name)
  );
}

/**
 * 락커 대여권을 회수할 때 배정/연장된 락커를 되돌린다.
 * 이 구매(±3초)로 생긴 배정 이력만 대상으로 한다.
 */
async function revertLockers(opts: {
  centerId: number;
  memberId: number;
  rentalCreatedAt: string;
  actorUid: string | null;
}): Promise<{ returned: number; reverted: number }> {
  const out = { returned: 0, reverted: 0 };
  const lo = new Date(Date.parse(opts.rentalCreatedAt) - 3000).toISOString();
  const hi = new Date(Date.parse(opts.rentalCreatedAt) + 3000).toISOString();

  const { data: lhData } = await supabase
    .from("crm_locker_history")
    .select("locker_id, created_at")
    .eq("center_id", opts.centerId)
    .eq("member_id", opts.memberId)
    .eq("action", "assign")
    .gte("created_at", lo)
    .lte("created_at", hi);

  const hist = (lhData ?? []) as { locker_id: number; created_at: string }[];
  const lockerIds = Array.from(new Set(hist.map((h) => h.locker_id)));
  const nowIso = new Date().toISOString();

  for (const lid of lockerIds) {
    const thisAssign = hist
      .filter((h) => h.locker_id === lid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!thisAssign) continue;

    const { data: prev } = await supabase
      .from("crm_locker_history")
      .select("action, start_date, expires_at")
      .eq("locker_id", lid)
      .lt("created_at", thisAssign.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: lk } = await supabase
      .from("crm_lockers")
      .select("zone_id, number")
      .eq("id", lid)
      .eq("center_id", opts.centerId)
      .maybeSingle();
    const prevRow = prev as { action: string; start_date: string | null; expires_at: string | null } | null;
    const lock = lk as { zone_id: number; number: number } | null;

    if (prevRow && prevRow.action === "assign") {
      // 연장 전 기간으로 되돌린다
      await supabase
        .from("crm_lockers")
        .update({ start_date: prevRow.start_date, expires_at: prevRow.expires_at, updated_at: nowIso } as never)
        .eq("id", lid)
        .eq("center_id", opts.centerId);
      if (lock) {
        await supabase.from("crm_locker_history").insert({
          center_id: opts.centerId, locker_id: lid, zone_id: lock.zone_id, number: lock.number,
          action: "update", member_id: opts.memberId,
          start_date: prevRow.start_date, expires_at: prevRow.expires_at, actor_uid: opts.actorUid,
        } as never);
      }
      out.reverted++;
    } else {
      // 이번에 처음 배정된 자리 → 반납
      await supabase
        .from("crm_lockers")
        .update({
          state: "unassigned", assigned_member_id: null, start_date: null,
          expires_at: null, password: null, memo: null, updated_at: nowIso,
        } as never)
        .eq("id", lid)
        .eq("center_id", opts.centerId);
      if (lock) {
        await supabase.from("crm_locker_history").insert({
          center_id: opts.centerId, locker_id: lid, zone_id: lock.zone_id, number: lock.number,
          action: "return", member_id: opts.memberId, actor_uid: opts.actorUid,
        } as never);
      }
      out.returned++;
    }
  }
  return out;
}

/**
 * 결제 1건에 연결된 발급물을 회수한다. 결제원장 자체는 남는다.
 * 이미 회수됐거나 연결된 상품이 없으면 ok:true, kind:null 로 조용히 지나간다.
 */
export async function retireIssuedForPayment(opts: {
  centerId: number;
  paymentId: number;
  actorUid?: string | null;
}): Promise<RetireResult> {
  const { data: payRow } = await supabase
    .from("crm_payments")
    .select("id, member_id, pass_id, membership_id, rental_id, product_label")
    .eq("id", opts.paymentId)
    .eq("center_id", opts.centerId)
    .maybeSingle();
  const pay = payRow as {
    id: number;
    member_id: number;
    pass_id: number | null;
    membership_id: number | null;
    rental_id: number | null;
    product_label: string | null;
  } | null;
  if (!pay) return { ok: false, kind: null, label: null, error: "결제내역을 찾을 수 없어요" };

  const kind: RetireKind = pay.membership_id
    ? "membership"
    : pay.pass_id
      ? "pass"
      : pay.rental_id
        ? "rental"
        : null;
  if (!kind) return { ok: true, kind: null, label: pay.product_label };

  /* ── 1) 상품명 스냅샷 + 락커 원복에 필요한 정보 ─────────── */
  let label: string | null = null;
  let locker: { returned: number; reverted: number } | undefined;

  if (kind === "membership") {
    const { data } = await supabase
      .from("crm_memberships")
      .select("plan_name")
      .eq("id", pay.membership_id!)
      .maybeSingle();
    label = (data as { plan_name?: string } | null)?.plan_name ?? "회원권";
  } else if (kind === "pass") {
    const { data } = await supabase
      .from("crm_passes")
      .select("lesson_kind")
      .eq("id", pay.pass_id!)
      .maybeSingle();
    label = (data as { lesson_kind?: string } | null)?.lesson_kind ?? "수강권";
  } else {
    const { data } = await supabase
      .from("crm_rentals")
      .select("item_name, memo, created_at")
      .eq("id", pay.rental_id!)
      .maybeSingle();
    const r = data as { item_name: string | null; memo: string | null; created_at: string } | null;
    label = r?.item_name ?? "대여권";
    /* ── 2) 락커면 자리를 되돌린다 ─────────────────────────── */
    if (r && isLockerRental(r)) {
      locker = await revertLockers({
        centerId: opts.centerId,
        memberId: pay.member_id,
        rentalCreatedAt: r.created_at,
        actorUid: opts.actorUid ?? null,
      });
    }
  }

  /* ── 3) 연결을 먼저 끊는다 (안 끊으면 결제원장이 CASCADE 로 사라진다) ── */
  const { error: detachErr } = await supabase
    .from("crm_payments")
    .update({
      pass_id: null,
      membership_id: null,
      rental_id: null,
      product_label: pay.product_label ?? label,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", pay.id)
    .eq("center_id", opts.centerId);
  if (detachErr) {
    return { ok: false, kind, label, error: `결제 연결 해제 실패: ${detachErr.message}` };
  }

  /* ── 4) 상품 삭제 ──────────────────────────────────────── */
  const table = kind === "membership" ? "crm_memberships" : kind === "pass" ? "crm_passes" : "crm_rentals";
  const targetId = kind === "membership" ? pay.membership_id! : kind === "pass" ? pay.pass_id! : pay.rental_id!;
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("id", targetId)
    .eq("center_id", opts.centerId);
  if (delErr) {
    return { ok: false, kind, label, error: `이용권 회수 실패: ${delErr.message}` };
  }

  return { ok: true, kind, label, locker };
}

/** 로그에 쓰는 한글 상품 구분 */
export const RETIRE_KIND_LABEL: Record<string, string> = {
  membership: "회원권",
  pass: "수강권",
  rental: "대여권/락커",
};
