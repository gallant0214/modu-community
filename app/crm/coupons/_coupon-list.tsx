"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass, CrmModal } from "../_components/crm-modal";
import { formatWon, parseWon } from "../_components/crm-labels";
import {
  BENEFIT_LABEL,
  PRODUCT_TYPE_LABEL,
  benefitText,
  conditionText,
  type BenefitType,
  type CouponDef,
} from "@/app/lib/crm-coupons";
import { EmptyBox, FieldLabel, authedFetch, formatYmd, ghostBtn, primaryBtn, won } from "./_shared";

export interface CouponRow extends CouponDef {
  description: string | null;
  created_by_name: string | null;
  created_at: string;
  sendable: boolean;
  stats: {
    issued: number;
    available: number;
    used: number;
    revoked: number;
    expired: number;
    discount: number;
    sales: number;
    useRate: number;
  };
}

interface ProductOpt {
  id: number;
  type: string;
  name: string;
  price_won: number;
}

/**
 * 쿠폰 탭 — 목록·요약·만들기·수정·보관.
 * onSend: 목록에서 바로 '발송' 으로 넘어가기
 */
export function CouponListTab({
  canManage,
  onSend,
  onOpenIssues,
  refreshKey,
}: {
  canManage: boolean;
  onSend: (couponId: number) => void;
  onOpenIssues: (couponId: number) => void;
  refreshKey: number;
}) {
  const { getIdToken } = useAuth();
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [summary, setSummary] = useState<CouponRow["stats"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<CouponRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await authedFetch(getIdToken, `/api/crm/coupons?status=${filter}`);
      if (!r.ok) setError(String(r.data.error ?? "불러오지 못했어요"));
      else {
        setRows((r.data.coupons as CouponRow[]) ?? []);
        setSummary((r.data.summary as CouponRow["stats"]) ?? null);
      }
    } catch {
      setError("네트워크 오류로 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, filter]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const archive = async (c: CouponRow, action: "archive" | "restore") => {
    if (action === "archive" && !confirm(`'${c.name}' 쿠폰을 보관할까요?\n이미 발급된 쿠폰은 그대로 쓸 수 있고, 새로 발송만 막혀요.`)) return;
    const r = await authedFetch(getIdToken, `/api/crm/coupons/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    if (!r.ok) return alert(String(r.data.error ?? "처리 실패"));
    load();
  };

  return (
    <div>
      {/* 전체 요약 — 쿠폰이 얼마나 쓰이고 얼마를 깎아줬는지 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
          <Tile label="발급한 쿠폰" value={`${summary.issued.toLocaleString()}장`} sub={`사용 가능 ${summary.available.toLocaleString()}장`} />
          <Tile label="사용된 쿠폰" value={`${summary.used.toLocaleString()}장`} sub={`사용률 ${summary.useRate}%`} accent />
          <Tile label="쿠폰 할인 총액" value={won(summary.discount)} sub="고객에게 깎아준 금액" />
          <Tile label="쿠폰 결제 매출" value={won(summary.sales)} sub="쿠폰을 쓴 결제의 실결제액" />
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
          {(["active", "archived"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${
                filter === k ? "bg-[#6B7B3A] text-white" : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300"
              }`}
            >
              {k === "active" ? "사용 중" : "보관함"}
            </button>
          ))}
        </div>
        {canManage && (
          <button type="button" onClick={() => setEditing("new")} className={`${primaryBtn} ml-auto`}>
            + 쿠폰 만들기
          </button>
        )}
      </div>

      {error && <EmptyBox>{error}</EmptyBox>}
      {loading && rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : rows.length === 0 && !error ? (
        <EmptyBox>
          {filter === "active" ? (
            <>
              아직 만든 쿠폰이 없어요.
              {canManage && <div className="mt-1 text-[12px] text-[#A89B80]">오른쪽 위 &lsquo;쿠폰 만들기&rsquo;로 시작해 보세요.</div>}
            </>
          ) : (
            "보관한 쿠폰이 없어요."
          )}
        </EmptyBox>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((c) => (
            <li key={c.id} className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden">
              {/* 쿠폰 모양 헤더 */}
              <div className="px-4 pt-3.5 pb-3 border-b border-dashed border-[#E8E0D0] dark:border-zinc-700">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold bg-[#EFE7D5] text-[#6B5D47] dark:bg-zinc-800 dark:text-zinc-400">
                    {BENEFIT_LABEL[c.benefit_type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 truncate">{c.name}</div>
                    <div className="text-[17px] font-extrabold text-[#4d5a29] dark:text-[#A8B87A] leading-tight mt-0.5">
                      {benefitText(c)}
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500 space-y-0.5">
                  {conditionText(c) && <div>조건 · {conditionText(c)}</div>}
                  <div>
                    기한 ·{" "}
                    {c.valid_mode === "until" ? `${formatYmd(c.valid_until)}까지` : `받은 날부터 ${c.valid_days}일`}
                    {c.one_per_member && " · 1인 1장"}
                  </div>
                  {c.description && <div className="text-[#A89B80] truncate">{c.description}</div>}
                </div>
              </div>

              {/* 사용 현황 — 발급 대비 사용 막대 */}
              <div className="px-4 py-2.5">
                <div className="flex items-baseline gap-3 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                  <span>발급 <b className="text-[#2A251D] dark:text-zinc-100">{c.stats.issued}</b></span>
                  <span>사용 <b className="text-[#2A251D] dark:text-zinc-100">{c.stats.used}</b></span>
                  <span>보유 <b className="text-[#2A251D] dark:text-zinc-100">{c.stats.available}</b></span>
                  {c.stats.revoked + c.stats.expired > 0 && (
                    <span className="text-[#A89B80]">회수·만료 {c.stats.revoked + c.stats.expired}</span>
                  )}
                  <span className="ml-auto font-semibold text-[#4d5a29] dark:text-[#A8B87A]">사용률 {c.stats.useRate}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[#EFE7D5] dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#5c8a1e] dark:bg-[#6ea023]"
                    style={{ width: `${Math.min(100, c.stats.useRate)}%` }}
                  />
                </div>
                {c.stats.discount > 0 && (
                  <div className="mt-1.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                    할인 {won(c.stats.discount)} · 쿠폰 결제 {won(c.stats.sales)}
                  </div>
                )}
              </div>

              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {c.sendable && (
                  <button type="button" onClick={() => onSend(c.id)} className={primaryBtn}>
                    발송하기
                  </button>
                )}
                <button type="button" onClick={() => onOpenIssues(c.id)} className={ghostBtn}>
                  받은 회원 보기
                </button>
                {canManage && (
                  <>
                    <button type="button" onClick={() => setEditing(c)} className={ghostBtn}>
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => archive(c, c.status === "archived" ? "restore" : "archive")}
                      className={ghostBtn}
                    >
                      {c.status === "archived" ? "보관 해제" : "보관"}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CouponEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-3.5 py-3">
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[19px] font-bold tabular-nums ${accent ? "text-[#4d5a29] dark:text-[#A8B87A]" : "text-[#2A251D] dark:text-zinc-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-[#A89B80] dark:text-zinc-600">{sub}</div>}
    </div>
  );
}

/* ─── 쿠폰 만들기 / 수정 ───────────────────────── */

const TYPE_KEYS = ["membership", "personal", "group", "class", "apparel", "locker", "goods"];

function CouponEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: CouponRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getIdToken } = useAuth();
  // 이미 발급된 쿠폰은 혜택·조건을 못 바꾼다(받은 회원 쿠폰 가치가 달라지므로)
  const locked = !!initial && initial.stats.issued > 0;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [benefitType, setBenefitType] = useState<BenefitType>(initial?.benefit_type ?? "amount");
  const [amountWon, setAmountWon] = useState(initial?.amount_won ?? 10000);
  const [percent, setPercent] = useState<number>(Number(initial?.percent ?? 10));
  const [maxDiscount, setMaxDiscount] = useState(initial?.max_discount_won ?? 0);
  const [minPurchase, setMinPurchase] = useState(initial?.min_purchase_won ?? 0);
  const [giftProductId, setGiftProductId] = useState<number | "">(initial?.gift_product_id ?? "");
  const [types, setTypes] = useState<string[]>(initial?.applicable_types ?? []);
  const [validMode, setValidMode] = useState<"days" | "until">(initial?.valid_mode ?? "days");
  const [validDays, setValidDays] = useState(initial?.valid_days ?? 30);
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? "");
  const [onePer, setOnePer] = useState(initial?.one_per_member ?? true);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const r = await authedFetch(getIdToken, "/api/crm/products");
      const list = ((r.data.products as (ProductOpt & { status?: string; trainer_member_id?: number | null })[]) ?? [])
        .filter((p) => (p.status ?? "active") === "active" && !p.trainer_member_id);
      setProducts(list);
    })();
  }, [getIdToken]);

  const preview = useMemo<CouponDef>(
    () => ({
      id: 0,
      name,
      benefit_type: benefitType,
      amount_won: amountWon,
      percent,
      max_discount_won: maxDiscount || null,
      min_purchase_won: minPurchase,
      gift_product_id: giftProductId ? Number(giftProductId) : null,
      gift_product_name: products.find((p) => p.id === Number(giftProductId))?.name ?? null,
      applicable_types: types.length ? types : null,
      valid_mode: validMode,
      valid_days: validDays,
      valid_until: validUntil || null,
    }),
    [name, benefitType, amountWon, percent, maxDiscount, minPurchase, giftProductId, products, types, validMode, validDays, validUntil]
  );

  const save = async () => {
    setError("");
    setSaving(true);
    const payload = {
      name,
      description,
      benefit_type: benefitType,
      amount_won: amountWon,
      percent,
      max_discount_won: maxDiscount || null,
      min_purchase_won: minPurchase,
      gift_product_id: giftProductId || null,
      applicable_types: types,
      valid_mode: validMode,
      valid_days: validDays,
      valid_until: validUntil,
      one_per_member: onePer,
    };
    const r = initial
      ? await authedFetch(getIdToken, `/api/crm/coupons/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await authedFetch(getIdToken, "/api/crm/coupons", { method: "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (!r.ok) return setError(String(r.data.error ?? "저장 실패"));
    onSaved();
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
      active
        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
        : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 bg-white dark:bg-zinc-900"
    } disabled:opacity-50`;

  return (
    <CrmModal open onClose={onClose} title={initial ? "쿠폰 수정" : "쿠폰 만들기"} size="lg">
      <div className="space-y-1">
        {locked && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-[#B47B2A]/[0.08] border border-[#B47B2A]/30 text-[12px] text-[#6B5D47] dark:text-zinc-300">
            이미 {initial?.stats.issued}장이 발급된 쿠폰이라 <b>이름·설명만</b> 바꿀 수 있어요. 혜택을 바꾸려면 새 쿠폰을 만들어 주세요.
          </div>
        )}

        <FieldLabel>쿠폰 이름</FieldLabel>
        <input className={crmInputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="예: 재등록 감사 쿠폰" />

        <FieldLabel hint="(선택) 직원이 보는 메모">설명</FieldLabel>
        <input className={crmInputClass} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="예: 9월 재등록 이벤트" />

        <FieldLabel>혜택</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(["amount", "percent", "gift"] as BenefitType[]).map((b) => (
            <button key={b} type="button" disabled={locked} onClick={() => setBenefitType(b)} className={chip(benefitType === b)}>
              {BENEFIT_LABEL[b]}
            </button>
          ))}
        </div>

        {benefitType === "amount" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>할인 금액 (원)</FieldLabel>
              <input className={crmInputClass} inputMode="numeric" disabled={locked} value={amountWon ? formatWon(amountWon) : ""} onChange={(e) => setAmountWon(parseWon(e.target.value))} />
            </div>
            <div>
              <FieldLabel hint="(0 = 조건 없음)">최소 결제금액</FieldLabel>
              <input className={crmInputClass} inputMode="numeric" disabled={locked} value={minPurchase ? formatWon(minPurchase) : ""} onChange={(e) => setMinPurchase(parseWon(e.target.value))} placeholder="0" />
            </div>
          </div>
        )}
        {benefitType === "percent" && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <FieldLabel>할인율 (%)</FieldLabel>
              <input className={crmInputClass} type="number" min={1} max={100} disabled={locked} value={percent} onChange={(e) => setPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </div>
            <div>
              <FieldLabel hint="(0 = 제한 없음)">최대 할인액</FieldLabel>
              <input className={crmInputClass} inputMode="numeric" disabled={locked} value={maxDiscount ? formatWon(maxDiscount) : ""} onChange={(e) => setMaxDiscount(parseWon(e.target.value))} placeholder="0" />
            </div>
            <div>
              <FieldLabel hint="(0 = 조건 없음)">최소 결제금액</FieldLabel>
              <input className={crmInputClass} inputMode="numeric" disabled={locked} value={minPurchase ? formatWon(minPurchase) : ""} onChange={(e) => setMinPurchase(parseWon(e.target.value))} placeholder="0" />
            </div>
          </div>
        )}
        {benefitType === "gift" && (
          <>
            <FieldLabel hint="발급창에서 이 상품을 고르면 0원으로 발급돼요">증정 상품</FieldLabel>
            <select className={crmInputClass} disabled={locked} value={giftProductId} onChange={(e) => setGiftProductId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">상품 선택</option>
              {TYPE_KEYS.map((t) => {
                const list = products.filter((p) => p.type === t);
                if (list.length === 0) return null;
                return (
                  <optgroup key={t} label={PRODUCT_TYPE_LABEL[t] ?? t}>
                    {list.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({won(p.price_won)})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </>
        )}

        {benefitType !== "gift" && (
          <>
            <FieldLabel hint="(아무것도 안 고르면 전체 상품)">쓸 수 있는 상품 종류</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_KEYS.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={locked}
                  onClick={() => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
                  className={chip(types.includes(t))}
                >
                  {PRODUCT_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </>
        )}

        <FieldLabel>사용 기한</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={locked} onClick={() => setValidMode("days")} className={chip(validMode === "days")}>받은 날부터</button>
          <button type="button" disabled={locked} onClick={() => setValidMode("until")} className={chip(validMode === "until")}>날짜 지정</button>
          {validMode === "days" ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-[#3A342A] dark:text-zinc-200">
              <input className={`${crmInputClass} !w-24`} type="number" min={1} max={3650} disabled={locked} value={validDays} onChange={(e) => setValidDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} />
              일 동안
            </span>
          ) : (
            <input className={`${crmInputClass} !w-44`} type="date" disabled={locked} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          )}
        </div>

        <label className="mt-3 flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-[#6B7B3A]" disabled={locked} checked={onePer} onChange={(e) => setOnePer(e.target.checked)} />
          <span className="text-[12.5px] text-[#3A342A] dark:text-zinc-200">
            1인 1장 — 아직 안 쓴 이 쿠폰이 있는 회원에게는 다시 발급하지 않아요
          </span>
        </label>

        {/* 미리보기 */}
        <div className="mt-4 rounded-xl border border-dashed border-[#6B7B3A]/50 bg-[#6B7B3A]/[0.05] px-4 py-3">
          <div className="text-[11px] font-semibold text-[#8C8270]">회원이 받는 쿠폰</div>
          <div className="mt-0.5 text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">{name || "쿠폰 이름"}</div>
          <div className="text-[18px] font-extrabold text-[#4d5a29] dark:text-[#A8B87A]">{benefitText(preview)}</div>
          <div className="text-[11.5px] text-[#8C8270]">
            {[conditionText(preview), validMode === "until" ? `${formatYmd(validUntil)}까지` : `받은 날부터 ${validDays}일`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>

        {error && <div className="mt-2 text-[12.5px] text-[#B4442A]">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostBtn}>취소</button>
          <button type="button" onClick={save} disabled={saving} className={primaryBtn}>
            {saving ? "저장 중…" : initial ? "저장" : "쿠폰 만들기"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}
