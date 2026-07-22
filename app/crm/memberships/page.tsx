"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";
import {
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  parseWon,
  formatPhone,
} from "../_components/crm-labels";
import { useColumnWidths, ResizableTh } from "../_components/use-column-widths";
import { MembershipDetailModal } from "./_components/membership-detail-modal";

const M_COLS = [
  { key: "member", label: "회원" },
  { key: "phone", label: "연락처" },
  { key: "plan", label: "상품명" },
  { key: "purchased", label: "구매일" },
  { key: "duration", label: "기간(일)" },
  { key: "start", label: "시작" },
  { key: "expires", label: "만료" },
  { key: "price", label: "금액" },
  { key: "payment", label: "결제" },
  { key: "status", label: "상태" },
] as const;
type MColKey = (typeof M_COLS)[number]["key"];
const M_DEFAULT_WIDTHS: Record<MColKey, number> = {
  member: 170,
  phone: 130,
  plan: 150,
  purchased: 110,
  duration: 84,
  start: 110,
  expires: 110,
  price: 110,
  payment: 96,
  status: 90,
};

interface Row {
  id: number;
  member_id: number;
  member_name: string;
  member_phone: string | null;
  member_face_thumb: string | null;
  plan_name: string;
  duration_days: number;
  price_won: number;
  payment_method: string;
  payment_method_custom: string | null;
  start_date: string;
  expires_at: string;
  purchased_at: string | null;
  status: string;
}

export default function CrmMembershipsPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [query, setQuery] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  // memberships PATCH 는 결제 항목 변경 시 sales.edit 권한 필요 (금액/결제/기간)
  const canEdit = !!perms["sales.edit"];
  const { widths, startResize, reset, changed, totalWidth } = useColumnWidths<MColKey>(
    "crm_memberships_col_widths_v1",
    M_DEFAULT_WIDTHS
  );

  // 발급 → 계약서 선택 흐름
  const [pending, setPending] = useState<{ membershipId: number; memberId: number } | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [purchaseDone, setPurchaseDone] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/crm/memberships?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.memberships ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 권한 로드 (memberships.edit)
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setPerms(data.permissions ?? {});
        }
      } catch {
        /* ignore */
      }
    })();
  }, [getIdToken]);

  const visibleList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      const paymentMatches = paymentFilter ? p.payment_method === paymentFilter : true;
      const queryMatches = q
        ? [p.member_name, p.member_phone, p.plan_name]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        : true;
      return paymentMatches && queryMatches;
    });
  }, [list, paymentFilter, query]);

  const stats = useMemo(() => {
    const valid = list.filter((p) => p.status === "valid");
    const expiring = valid.filter((p) => daysUntil(p.expires_at) <= 7).length;
    const avgDuration =
      list.length > 0
        ? Math.round(list.reduce((sum, p) => sum + (Number(p.duration_days) || 0), 0) / list.length)
        : 0;
    return {
      total: list.length,
      valid: valid.length,
      expiring,
      revenue: list.reduce((sum, p) => sum + (Number(p.price_won) || 0), 0),
      avgDuration,
    };
  }, [list]);

  const filtersActive = !!statusFilter || !!paymentFilter || !!query.trim();
  const resetFilters = () => {
    setStatusFilter("");
    setPaymentFilter("");
    setQuery("");
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-7xl mx-auto">
      <header className="mb-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950/60 px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500">
              MEMBERSHIP CONTROL
            </p>
            <h1 className="mt-1 text-[22px] md:text-[26px] font-bold text-[#241F18] dark:text-zinc-100">
              회원권 관리
            </h1>
            <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
              기간형 이용권의 결제, 시작일, 만료일을 한 화면에서 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-[#D9CDB8] bg-white/70 px-3 py-2 text-right dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">현재 결과</div>
              <div className="mt-0.5 text-[18px] font-bold text-[#2F3A2B] dark:text-[#A8B87A]">
                {visibleList.length.toLocaleString()}건
              </div>
            </div>
            <button
              onClick={() => setIssueOpen(true)}
              className="h-[50px] px-4 rounded-lg bg-[#2F3A2B] text-white text-[13px] font-semibold hover:bg-[#243020] whitespace-nowrap shadow-sm dark:bg-[#A8B87A] dark:text-zinc-950"
            >
              + 회원권 발급
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2.5">
          <MetricCard label="전체 회원권" value={`${stats.total.toLocaleString()}건`} hint="조회 결과 기준" />
          <MetricCard label="유효 회원권" value={`${stats.valid.toLocaleString()}건`} hint="출입 가능한 권한" tone="green" />
          <MetricCard label="7일 내 만료" value={`${stats.expiring.toLocaleString()}건`} hint="재등록 안내 대상" tone="gold" />
          <MetricCard label="회원권 매출" value={`${formatWon(stats.revenue)}원`} hint="현재 필터 합계" tone="dark" />
          <MetricCard label="평균 기간" value={`${stats.avgDuration.toLocaleString()}일`} hint="상품 기간 평균" tone="blue" />
        </div>
      </header>

      <section className="mb-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "", label: "전체" },
              { value: "valid", label: "유효" },
              { value: "expired", label: "만료" },
              { value: "refunded", label: "환불" },
            ]}
          />
          <select
            className={`${crmInputClass} !w-auto min-w-[150px]`}
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="">모든 결제 수단</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            className={`${crmInputClass} ml-auto max-w-[280px]`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="회원, 연락처, 상품명 검색"
          />
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            >
              필터 초기화
            </button>
          )}
        </div>
      </section>

      {changed && !loading && visibleList.length > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            열 너비 초기화
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <Msg>불러오는 중…</Msg>
      ) : visibleList.length === 0 ? (
        <Msg>일치하는 회원권이 없습니다.</Msg>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
          <table className="w-full text-[13px] table-fixed" style={{ minWidth: totalWidth }}>
            <colgroup>
              {M_COLS.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] }} />
              ))}
            </colgroup>
            <thead className="bg-[#F6F0E5] dark:bg-zinc-950/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                {M_COLS.map((c) => (
                  <ResizableTh key={c.key} colKey={c.key} label={c.label} onStart={startResize} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
              {visibleList.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setDetailRow(p)}
                  className="bg-[#FEFCF7] dark:bg-zinc-900 cursor-pointer hover:bg-[#FAF5EA] dark:hover:bg-zinc-800/55 transition-colors"
                >
                  <Td>
                    <Link
                      href={`/crm/members/${p.member_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 min-w-0 group"
                    >
                      {p.member_face_thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.member_face_thumb}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover border border-[#E8E0D0] dark:border-zinc-700 shrink-0"
                        />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 shrink-0 flex items-center justify-center text-[10px] text-[#A89B80]">
                          —
                        </span>
                      )}
                      <span className="font-semibold text-[#2A251D] dark:text-zinc-100 truncate group-hover:text-[#6B7B3A] dark:group-hover:text-[#A8B87A] group-hover:underline">
                        {p.member_name || "—"}
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-[#8C8270]">
                    {p.member_phone ? formatPhone(p.member_phone) : "—"}
                  </Td>
                  <Td>
                    <div className="font-semibold text-[#2A251D] dark:text-zinc-100 truncate">{p.plan_name}</div>
                    <div className="mt-0.5 text-[11.5px] text-[#A89B80]">기간 {p.duration_days}일</div>
                  </Td>
                  <Td className="text-[#8C8270]">{p.purchased_at ? p.purchased_at.slice(0, 10) : "—"}</Td>
                  <Td>
                    <DurationPill days={p.duration_days} />
                  </Td>
                  <Td className="text-[#8C8270]">{p.start_date}</Td>
                  <Td>
                    <ExpiryCell expiresAt={p.expires_at} status={p.status} />
                  </Td>
                  <Td className="font-semibold text-[#2A251D] dark:text-zinc-100">{formatWon(p.price_won)}원</Td>
                  <Td>
                    {p.payment_method === "etc" && p.payment_method_custom
                      ? p.payment_method_custom
                      : PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                  </Td>
                  <Td>
                    <StatusChip status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IssueModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onSuccess={(membershipId, memberId) => {
          setIssueOpen(false);
          setPending({ membershipId, memberId });
          setChoiceOpen(true);
          load();
        }}
      />

      <PostIssueChoiceModal
        open={choiceOpen}
        onClose={() => {
          setChoiceOpen(false);
          setPending(null);
        }}
        onSign={() => {
          setChoiceOpen(false);
          setPickerOpen(true);
        }}
        onSkip={() => {
          setChoiceOpen(false);
          setPending(null);
          setPurchaseDone(true);
        }}
      />

      <TemplatePickerModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPending(null);
        }}
        memberId={pending?.memberId ?? null}
        membershipId={pending?.membershipId ?? null}
      />

      <PurchaseDoneBanner open={purchaseDone} onClose={() => setPurchaseDone(false)} />

      <MembershipDetailModal
        row={detailRow}
        canEdit={canEdit}
        onClose={() => setDetailRow(null)}
        onSaved={load}
      />
    </div>
  );
}

function PostIssueChoiceModal({
  open,
  onClose,
  onSign,
  onSkip,
}: {
  open: boolean;
  onClose: () => void;
  onSign: () => void;
  onSkip: () => void;
}) {
  return (
    <CrmModal open={open} onClose={onClose} title="결제 완료">
      <p className="text-[13.5px] text-[#3A342A] dark:text-zinc-300 mb-1">
        결제가 완료되었어요. 전자 계약서를 작성할까요?
      </p>
      <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mb-4">
        지금 작성하지 않아도 추후 회원 상세에서 발급한 회원권을 통해 작성할 수 있어요.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
        >
          계약서 미작성
        </button>
        <button
          type="button"
          onClick={onSign}
          className="flex-1 px-4 py-2.5 rounded-lg bg-[#B47B2A] hover:bg-[#9c6722] text-white text-[13.5px] font-semibold"
        >
          계약서 작성
        </button>
      </div>
    </CrmModal>
  );
}

function TemplatePickerModal({
  open,
  onClose,
  memberId,
  membershipId,
}: {
  open: boolean;
  onClose: () => void;
  memberId: number | null;
  membershipId: number | null;
}) {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [list, setList] = useState<{ id: number; category: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        const res = await fetch("/api/crm/contracts?sort=name_asc", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setList(data.contracts ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, getIdToken]);

  const pick = (templateId: number) => {
    if (!memberId) return;
    const params = new URLSearchParams();
    params.set("member_id", String(memberId));
    if (membershipId) params.set("membership_id", String(membershipId));
    params.set("template_id", String(templateId));
    router.push(`/crm/contracts/sign/new?${params}`);
  };

  return (
    <CrmModal open={open} onClose={onClose} title="계약서 양식 선택">
      <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-3">
        상품에 맞는 계약서 양식을 선택해 주세요.
      </p>
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {loading ? (
        <div className="px-4 py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl space-y-3">
          <div>등록된 계약서 양식이 없어요.</div>
          <Link
            href="/crm/contracts"
            className="inline-block px-3 py-1.5 rounded-md text-[12px] font-medium bg-[#6B7B3A] text-white hover:bg-[#5a6932]"
          >
            계약서 페이지로 이동해 양식 만들기
          </Link>
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {list.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => pick(t.id)}
                className="w-full text-left px-3.5 py-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50"
              >
                <div className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  {t.title}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#A89B80]">카테고리: {t.category}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CrmModal>
  );
}

function PurchaseDoneBanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-x-0 top-20 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto px-5 py-3 rounded-2xl bg-[#6B7B3A] text-white shadow-lg text-[13.5px] font-semibold flex items-center gap-3">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        상품 구매가 완료되었습니다.
        <button onClick={onClose} className="ml-2 text-white/70 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  );
}

function IssueModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (membershipId: number, memberId: number) => void;
}) {
  const { getIdToken } = useAuth();
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: number; name: string; phone: string | null } | null>(null);
  const [products, setProducts] = useState<
    {
      id: number;
      name: string;
      billing_mode: "period" | "count";
      duration_value: number | null;
      duration_unit: string | null;
      service_days: number;
      price_won: number;
    }[]
  >([]);
  const [pickedProductId, setPickedProductId] = useState<number | "">("");
  const [planName, setPlanName] = useState("1개월 헬스 이용권");
  const [duration, setDuration] = useState(30);
  const [priceWon, setPriceWon] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "etc">("card");
  const [paymentCustom, setPaymentCustom] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [memo, setMemo] = useState("");
  const [staffList, setStaffList] = useState<{ id: number; display_name: string }[]>([]);
  const [sellerId, setSellerId] = useState<number | "">("");
  const [myMemberId, setMyMemberId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 직원 목록 + 로그인 본인 로드 (판매자 기본값용)
  useEffect(() => {
    if (!open) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const h = { authorization: `Bearer ${token}` };
      const [sRes, bRes] = await Promise.all([
        fetch("/api/crm/staff", { headers: h }),
        fetch("/api/crm/bootstrap", { headers: h, cache: "no-store" }),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setStaffList((d.staff ?? []).filter((s: { status: string }) => s.status === "active"));
      }
      if (bRes.ok) setMyMemberId((await bRes.json()).centerMemberId ?? null);
    })();
  }, [open, getIdToken]);

  // 판매자 기본값 = 로그인 본인
  useEffect(() => {
    if (open && staffList.length > 0 && sellerId === "") {
      const mine = myMemberId && staffList.some((s) => s.id === myMemberId) ? myMemberId : staffList[0].id;
      setSellerId(mine);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffList, myMemberId]);

  useEffect(() => {
    if (!open) {
      setSellerId("");
      setMemberQuery("");
      setMemberResults([]);
      setPicked(null);
      setPickedProductId("");
      setPlanName("1개월 헬스 이용권");
      setDuration(30);
      setPriceWon(0);
      setPaymentMethod("card");
      setPaymentCustom("");
      setPurchasedAt(new Date().toISOString().slice(0, 10));
      setMemo("");
      setError("");
      return;
    }
    // 회원권 상품 목록 로드
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/products?type=membership", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) setProducts(data.products ?? []);
      } catch {
        // ignore
      }
    })();
  }, [open, getIdToken]);

  const applyProduct = (id: number) => {
    setPickedProductId(id);
    const p = products.find((x) => x.id === id);
    if (!p) return;
    // 상품 이름 + 발급 유형 (신규) 표기
    setPlanName(`${p.name} (신규)`);
    setPriceWon(p.price_won);
    if (p.billing_mode === "period") {
      const v = p.duration_value ?? 0;
      const base =
        p.duration_unit === "month"
          ? v * 30
          : p.duration_unit === "year"
            ? v * 365
            : v;
      setDuration(Math.max(1, base + (p.service_days || 0)));
    }
  };

  // duration 변경 시 expires_at 자동 계산
  useEffect(() => {
    if (!startDate || !duration) return;
    const d = new Date(startDate);
    d.setDate(d.getDate() + Number(duration));
    setExpiresAt(d.toISOString().slice(0, 10));
  }, [startDate, duration]);

  const search = async () => {
    const q = memberQuery.trim();
    if (!q) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/members?q=${encodeURIComponent(q)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMemberResults(data.members ?? []);
    }
  };

  const submit = async () => {
    setError("");
    if (!picked) return setError("회원을 선택해 주세요");
    if (!planName.trim()) return setError("상품명을 입력해 주세요");
    if (duration < 1) return setError("기간은 1일 이상이어야 해요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/memberships", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_id: picked.id,
          plan_name: planName.trim(),
          duration_days: duration,
          price_won: priceWon,
          payment_method: paymentMethod,
          payment_method_custom: paymentMethod === "etc" ? paymentCustom : undefined,
          seller_member_id: sellerId || undefined,
          purchased_at: purchasedAt,
          start_date: startDate,
          expires_at: expiresAt,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "발급 실패");
      onSuccess(data.membershipId, picked.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="회원권 발급" size="lg">
      <div className="space-y-3">
        <CrmField label="회원" required>
          {picked ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/5">
              <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-200">
                <strong>{picked.name}</strong>
                {picked.phone && (
                  <span className="ml-2 text-[12px] text-[#8C8270]">{formatPhone(picked.phone)}</span>
                )}
              </span>
              <button
                onClick={() => setPicked(null)}
                className="text-[12px] text-[#6B7B3A] hover:underline"
              >
                다시 선택
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className={`${crmInputClass} flex-1`}
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="회원 이름 또는 연락처"
                />
                <button
                  onClick={search}
                  className="px-4 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold"
                >
                  검색
                </button>
              </div>
              {memberResults.length > 0 && (
                <ul className="mt-2 space-y-1.5 max-h-[160px] overflow-y-auto">
                  {memberResults.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => setPicked(m)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[#E8E0D0] hover:border-[#6B7B3A]/40"
                      >
                        <div className="text-[13px] font-medium">{m.name}</div>
                        {m.phone && (
                          <div className="text-[11.5px] text-[#A89B80]">{formatPhone(m.phone)}</div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CrmField>

        <CrmField label="상품에서 선택">
          {products.length === 0 ? (
            <div className="text-[12px] text-[#8C8270] dark:text-zinc-500 px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
              등록된 회원권 상품이 없어요.{" "}
              <Link href="/crm/products/new?type=membership" className="text-[#6B7B3A] hover:underline font-medium">
                상품 추가하러 가기 →
              </Link>
            </div>
          ) : (
            <select
              className={crmInputClass}
              value={pickedProductId}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setPickedProductId("");
                } else {
                  applyProduct(Number(v));
                }
              }}
            >
              <option value="">— 직접 입력 —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatWon(p.price_won)}원
                </option>
              ))}
            </select>
          )}
          {pickedProductId && (
            <p className="mt-1.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
              상품 정보로 아래 항목이 자동 채워졌어요. 필요시 수정할 수 있어요.
            </p>
          )}
        </CrmField>

        <CrmField label="상품명" required>
          <input
            className={crmInputClass}
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="예) 3개월 헬스 이용권"
          />
        </CrmField>

        <div className="grid grid-cols-2 gap-2">
          <CrmField label="기간 (일)" required>
            <input
              type="number"
              min={1}
              className={crmInputClass}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
          </CrmField>
          <CrmField label="결제 금액 (원)">
            <input
              type="text"
              inputMode="numeric"
              className={crmInputClass}
              value={priceWon ? formatWon(priceWon) : ""}
              onChange={(e) => setPriceWon(parseWon(e.target.value))}
              placeholder="0"
            />
          </CrmField>
        </div>

        <CrmField label="결제 수단">
          <div className="grid grid-cols-4 gap-1.5">
            {(["cash", "card", "transfer", "etc"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`px-2 py-2 rounded-lg text-[12px] font-medium
                  ${paymentMethod === m
                    ? "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {PAYMENT_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          {paymentMethod === "etc" && (
            <input
              className={`${crmInputClass} mt-2`}
              value={paymentCustom}
              onChange={(e) => setPaymentCustom(e.target.value)}
              placeholder="결제 수단을 직접 입력하세요"
            />
          )}
        </CrmField>

        <CrmField label="판매자">
          <select
            className={crmInputClass}
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">선택해 주세요</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[#A89B80]">
            기본은 로그인한 본인이에요. 실제 판매 직원이 다르면 바꿔 주세요.
          </p>
        </CrmField>

        <div className="grid grid-cols-3 gap-2">
          <CrmField label="구매일" required>
            <input
              type="date"
              className={crmInputClass}
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
            />
          </CrmField>
          <CrmField label="시작일" required>
            <input
              type="date"
              className={crmInputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </CrmField>
          <CrmField label="만료일" required>
            <input
              type="date"
              className={crmInputClass}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </CrmField>
        </div>
        <p className="-mt-1 text-[11.5px] text-[#A89B80]">
          구매일은 결제한 날, 시작일은 이용을 시작하는 날이에요. 나중에 시작하려면 시작일만 다르게 지정하세요.
        </p>

        <CrmField label="메모">
          <textarea
            className={`${crmInputClass} min-h-[60px]`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] mt-2"
        >
          {submitting ? "발급 중…" : "회원권 발급"}
        </button>
      </div>
    </CrmModal>
  );
}

function StatusChip({ status }: { status: string }) {
  const label = PASS_STATUS_LABEL[status] ?? status;
  const cls =
    status === "valid"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : status === "expired"
      ? "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "green",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "blue" | "gold" | "dark";
}) {
  const toneClass =
    tone === "blue"
      ? "text-[#315F7A] bg-[#EFF7F8] border-[#D7E7EA]"
      : tone === "gold"
      ? "text-[#826424] bg-[#FFF8E6] border-[#EAD9AA]"
      : tone === "dark"
      ? "text-[#2A251D] bg-[#F4F1EA] border-[#DDD3C2]"
      : "text-[#3E5D2D] bg-[#F3F7EA] border-[#DDE8C5]";

  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClass} dark:bg-zinc-900 dark:border-zinc-800`}>
      <div className="text-[11px] font-semibold opacity-75">{label}</div>
      <div className="mt-1 text-[18px] font-bold tracking-normal whitespace-nowrap">{value}</div>
      <div className="mt-1 text-[11.5px] opacity-70 whitespace-nowrap">{hint}</div>
    </div>
  );
}

function SegmentedFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-[#D9CDB8] dark:border-zinc-700 bg-[#F7F2E8] dark:bg-zinc-950 p-1">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors ${
              active
                ? "bg-[#2F3A2B] text-white shadow-sm dark:bg-[#A8B87A] dark:text-zinc-950"
                : "text-[#6B5D47] hover:bg-white/80 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DurationPill({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[58px] rounded-md bg-[#F5F0E5] dark:bg-zinc-800 px-2 py-1 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300">
      {days}일
    </span>
  );
}

function ExpiryCell({ expiresAt, status }: { expiresAt: string; status: string }) {
  const unlimited = expiresAt === "9999-12-31";
  const dDay = daysUntil(expiresAt);
  const urgent = !unlimited && status === "valid" && dDay <= 7;
  const label = status !== "valid" ? "종료" : dDay < 0 ? "만료" : dDay === 0 ? "오늘" : `D-${dDay}`;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[#8C8270] dark:text-zinc-500 truncate">{unlimited ? "무기한" : expiresAt}</span>
      {!unlimited && (
        <span
          className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-bold ${
            urgent
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "bg-[#F5F0E5] text-[#7A6B51] dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function daysUntil(ymd: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T00:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-3 whitespace-nowrap overflow-hidden text-ellipsis ${className || ""}`}>
      {children}
    </td>
  );
}
function Msg({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}
