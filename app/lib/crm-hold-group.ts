import { supabase } from "@/app/lib/supabase";

export type HoldKind = "membership" | "pass" | "rental";

export const HOLD_TABLE: Record<HoldKind, "crm_memberships" | "crm_passes" | "crm_rentals"> = {
  membership: "crm_memberships",
  pass: "crm_passes",
  rental: "crm_rentals",
};
export const HOLD_COL: Record<HoldKind, "membership_id" | "pass_id" | "rental_id"> = {
  membership: "membership_id",
  pass: "pass_id",
  rental: "rental_id",
};

/** 묶음(같은 결제로 함께 발급) 판정 시간 창 — 결제 삭제 로직과 동일하게 ±3초 */
const BUNDLE_WINDOW_MS = 3000;

export interface HoldRow {
  kind: HoldKind;
  id: number;
  member_id: number;
  name: string;
  expires_at: string;
  status: string;
  is_paused: boolean;
  created_at: string;
  /** 락커 동기화 판정용 (rental 만) */
  item_name?: string | null;
  memo?: string | null;
}

/** 단일 이용권 조회 (센터 스코프) */
export async function loadHoldRow(
  centerId: number,
  kind: HoldKind,
  id: number
): Promise<HoldRow | null> {
  const table = HOLD_TABLE[kind];
  const nameCol = kind === "membership" ? "plan_name" : kind === "pass" ? "lesson_kind" : "item_name";
  const { data } = await supabase
    .from(table)
    .select(`id, member_id, ${nameCol}, expires_at, status, is_paused, created_at, memo`)
    .eq("id", id)
    .eq("center_id", centerId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  return {
    kind,
    id: Number(r.id),
    member_id: Number(r.member_id),
    name: String(r[nameCol] ?? ""),
    expires_at: String(r.expires_at ?? ""),
    status: String(r.status ?? ""),
    is_paused: !!r.is_paused,
    created_at: String(r.created_at ?? ""),
    item_name: kind === "rental" ? (r.item_name as string | null) : null,
    memo: (r.memo as string | null) ?? null,
  };
}

/**
 * 묶음(번들) 형제 찾기 — 같은 회원에게 같은 결제로(±3초) 함께 발급된 다른 상품들.
 * 회원권 + 락커/운동복 대여권 + 수강권이 한 결제로 나가는 묶음 상품을 한 덩어리로 다루기 위함.
 */
export async function findBundleSiblings(
  centerId: number,
  base: HoldRow
): Promise<HoldRow[]> {
  if (!base.created_at) return [];
  const t = Date.parse(base.created_at);
  if (!Number.isFinite(t)) return [];
  const lo = new Date(t - BUNDLE_WINDOW_MS).toISOString();
  const hi = new Date(t + BUNDLE_WINDOW_MS).toISOString();

  const specs: { kind: HoldKind; nameCol: string }[] = [
    { kind: "membership", nameCol: "plan_name" },
    { kind: "pass", nameCol: "lesson_kind" },
    { kind: "rental", nameCol: "item_name" },
  ];

  const out: HoldRow[] = [];
  for (const spec of specs) {
    const { data } = await supabase
      .from(HOLD_TABLE[spec.kind])
      .select(`id, member_id, ${spec.nameCol}, expires_at, status, is_paused, created_at, memo`)
      .eq("center_id", centerId)
      .eq("member_id", base.member_id)
      .gte("created_at", lo)
      .lte("created_at", hi);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const id = Number(row.id);
      if (spec.kind === base.kind && id === base.id) continue;
      out.push({
        kind: spec.kind,
        id,
        member_id: Number(row.member_id),
        name: String(row[spec.nameCol] ?? ""),
        expires_at: String(row.expires_at ?? ""),
        status: String(row.status ?? ""),
        is_paused: !!row.is_paused,
        created_at: String(row.created_at ?? ""),
        item_name: spec.kind === "rental" ? (row.item_name as string | null) : null,
        memo: (row.memo as string | null) ?? null,
      });
    }
  }
  return out;
}

export const holdKindLabel = (k: HoldKind) =>
  k === "membership" ? "회원권" : k === "pass" ? "수강권" : "대여권";
