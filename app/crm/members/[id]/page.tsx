"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import {
  MEMBER_TYPE_LABEL,
  GENDER_LABEL,
  ISSUE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  parseWon,
  formatPhone,
} from "../../_components/crm-labels";
import { CrmModal, CrmField, crmInputClass } from "../../_components/crm-modal";
import { CrmLineChart } from "../../_components/crm-line-chart";
import { unitToDays } from "@/app/lib/duration-convert";
import { computeFaceDescriptor } from "../../_lib/faceapi";

interface Member {
  id: number;
  member_type: string;
  name: string;
  phone: string;
  email: string | null;
  birth: string | null;
  gender: string | null;
  linked_firebase_uid: string | null;
  memo: string | null;
  status: string;
  address: string | null;
  visit_route: string | null;
  workout_goal: string | null;
  counselor: string | null;
  mileage: number;
  marketing_consent: boolean;
  registered_at: string | null;
  registration_type: string | null;
  first_use_at: string | null;
  total_paid_won: number;
  final_expire_at: string | null;
  last_purchase_at: string | null;
  last_attended_at: string | null;
  attendance_no: string | null;
  current_membership: string | null;
  current_pass: string | null;
  current_rental: string | null;
  current_locker: string | null;
  face_image_data: string | null;
  created_at: string;
}
interface Pass {
  id: number;
  issue_type: string;
  lesson_kind: string;
  total_sessions: number;
  remaining_sessions: number;
  service_sessions?: number;
  session_minutes: number;
  price_won: number;
  vat_included: boolean;
  payment_method: string;
  payment_method_custom: string | null;
  issued_at: string;
  start_date?: string | null;
  expires_at: string;
  status: string;
  trainer_member_id: number;
  seller_member_id?: number;
  co_trainer_ids?: number[];
  memo?: string | null;
  is_paused?: boolean;
  attendance_mileage_earn?: number;
}

export default function CrmMemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const memberId = Number(params.id);
  const { getIdToken } = useAuth();

  const [member, setMember] = useState<Member | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  // 다른 센터 담당 회원 = 조회 전용(편집·발급·삭제 차단)
  const [readOnly, setReadOnly] = useState(false);
  const [staffList, setStaffList] = useState<
    { id: number; display_name: string; role: string; status: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [passOpen, setPassOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageReload, setUsageReload] = useState(0);
  const [paymentDetail, setPaymentDetail] = useState<PaymentDetail | null>(null);
  const [lockerOpen, setLockerOpen] = useState(false);
  const [holdTarget, setHoldTarget] = useState<{ kind: "membership" | "rental"; id: number } | null>(null);
  const [detailPassId, setDetailPassId] = useState<number | null>(null);
  const [passStartEdit, setPassStartEdit] = useState(false); // 결제내역 '수정' 진입 시 편집 모드로 열기
  // 현재 보유(상단 요약) 편집용 실제 레코드
  const [holdMs, setHoldMs] = useState<MembershipRow[]>([]);
  const [holdRs, setHoldRs] = useState<RentalRow[]>([]);
  // 배정된 락커(실제 레코드) — current_locker 스냅샷이 없어도 현재 보유에 표시
  const [holdLockers, setHoldLockers] = useState<
    { id: number; zone_name: string; number: number; start_date: string | null; expires_at: string | null }[]
  >([]);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [bodyReload, setBodyReload] = useState(0);
  // 탭: 정보 / 예약내역 / 결제내역 / 로그
  const [tab, setTab] = useState<"info" | "reservations" | "payments" | "workout" | "logs">("info");
  // 현재 유저 권한 (members.edit_basic / members.edit_usage / members.delete)
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  // 로그인 직원 본인 center_member_id — 발급 시 판매자 기본값
  const [myMemberId, setMyMemberId] = useState<number | null>(null);

  // 결제 후 흐름 (계약서 작성 선택)
  const [pendingPassId, setPendingPassId] = useState<number | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [purchaseDone, setPurchaseDone] = useState(false);

  // 계약서 페이지에서 ?purchase=done 으로 돌아온 경우 배너 노출
  useEffect(() => {
    if (searchParams.get("purchase") === "done") {
      setPurchaseDone(true);
      // URL 파라미터 클리어 (history 그대로 두고 query만 제거)
      router.replace(`/crm/members/${memberId}`);
    }
  }, [searchParams, router, memberId]);

  // 개인 CRM에서 다른 센터 담당 회원을 조회 전용으로 열람할 때 ?center=<id>
  const foreignCenter = searchParams.get("center");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(
        `/api/crm/members/${memberId}${foreignCenter ? `?center=${foreignCenter}` : ""}`,
        {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setMember(data.member);
      setPasses(data.passes ?? []);
      setReadOnly(!!data.read_only);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId, foreignCenter]);

  useEffect(() => {
    if (memberId) load();
  }, [memberId, load]);

  // 현재 보유(회원권·대여권) 실제 레코드 로드 — 상단 요약 칩을 편집 가능한 상세로 열기 위함
  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const h = { authorization: `Bearer ${token}` };
      const [mR, rR, lR] = await Promise.all([
        fetch(`/api/crm/memberships?member_id=${memberId}`, { headers: h, cache: "no-store" }),
        fetch(`/api/crm/rentals?member_id=${memberId}`, { headers: h, cache: "no-store" }),
        fetch(`/api/crm/lockers/of-member?member_id=${memberId}`, { headers: h, cache: "no-store" }),
      ]);
      if (mR.ok) setHoldMs((await mR.json()).memberships ?? []);
      if (rR.ok) setHoldRs((await rR.json()).rentals ?? []);
      if (lR.ok) setHoldLockers((await lR.json()).lockers ?? []);
    })();
  }, [memberId, usageReload, getIdToken]);

  // 현재 유저의 회원 관련 권한 로드
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
          setMyMemberId(data.centerMemberId ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [getIdToken]);

  // 조회 전용(다른 센터 회원)이면 모든 편집·삭제 차단
  const canEditBasic = !readOnly && !!perms["members.edit_basic"];
  const canEditUsage = !readOnly && !!perms["members.edit_usage"];
  const canDelete = !readOnly && !!perms["members.delete"];
  const canEditSales = !readOnly && !!perms["sales.edit"];
  const canRefundSales = !readOnly && (!!perms["sales.refund"] || !!perms["sales.edit"]);
  const canDeleteSales = !readOnly && !!perms["sales.delete"];

  // 직원 목록 1회 로드 (수강권 발급 모달 + 상세 모달 공용)
  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/staff", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStaffList(
          (data.staff ?? []).filter((s: { status: string }) => s.status === "active")
        );
      }
    })();
  }, [getIdToken]);

  const remove = async () => {
    if (!confirm("이 회원을 삭제할까요? 수강권은 그대로 남아있어요.")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/members/${memberId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || "삭제 실패");
      return;
    }
    router.push("/crm/members");
  };

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-6 text-[13px] text-[#8C8270]">불러오는 중…</div>
    );
  }
  if (!member) {
    return (
      <div className="px-5 md:px-8 py-6">
        <BackLink />
        <div className="mt-4 text-[14px] text-[#6B5D47]">{error || "회원을 찾을 수 없습니다."}</div>
      </div>
    );
  }

  const onSnapSelect = (tag: string, name: string, period: string | null) => {
    setPaymentDetail({
      tag,
      name,
      period,
      source: "snapshot",
      priceWon: member.total_paid_won,
      paidAt: member.last_purchase_at,
    });
  };

  // 현재 보유(상단 요약) — 실제 유효 레코드가 있으면 그걸로 (편집 가능), 없으면 POS 스냅샷 fallback
  const staffName = (id: number | null) =>
    id ? staffList.find((s) => s.id === id)?.display_name ?? null : null;
  // 오늘(KST) 기준. UTC 로 하면 한국 자정~오전9시 사이 만료 판정이 하루 어긋난다.
  const holdToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const validHoldMs = holdMs.filter((m) => m.status === "valid" && m.expires_at >= holdToday);
  const validHoldRs = holdRs.filter((r) => r.status === "valid" && r.expires_at >= holdToday);
  // 배정된 락커 중 유효기간이 남은 것 (만료 락커는 현재 보유에 제외 — 회원권·대여권과 동일 기준)
  const validHoldLockers = holdLockers.filter((l) => !l.expires_at || l.expires_at >= holdToday);
  const validHoldPasses = passes.filter(
    (p) => p.status === "valid" && p.expires_at >= holdToday
  );
  // 락커(배정) + 락커 대여권 병합 → 현재 보유에서 중복 제거
  const { cards: holdLockerCards, usedRentalIds: holdUsedRentalIds } = mergeLockerItems(
    validHoldLockers,
    validHoldRs
  );
  const holdOtherRs = validHoldRs.filter((r) => !holdUsedRentalIds.has(r.id));
  const hasHoldings =
    validHoldMs.length > 0 ||
    validHoldRs.length > 0 ||
    validHoldPasses.length > 0 ||
    validHoldLockers.length > 0 ||
    !!member.current_membership ||
    !!member.current_pass ||
    !!member.current_rental ||
    !!member.current_locker;

  const currentHoldings =
    validHoldLockers.length +
    [
      member.current_membership,
      member.current_pass,
      member.current_rental,
      // 락커: 실제 배정이 있으면 그걸로, 없으면 스냅샷
      validHoldLockers.length === 0 ? member.current_locker : null,
    ].filter(Boolean).length;

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-5xl mx-auto">
      <BackLink />

      {readOnly && (
        <div className="mt-3 mb-1 px-3.5 py-2.5 rounded-xl bg-[#EEF1E3] dark:bg-[#3a4127]/60 border border-[#D8DEC3] dark:border-[#4a5334] text-[12.5px] text-[#5c6b30] dark:text-[#A8B87A] leading-relaxed">
          🏢 <strong>다른 센터에서 담당하는 회원</strong>입니다. 조회만 가능하며, 수강권 발급·정보 수정·삭제는 해당 센터로 전환하거나 앱에서 진행하세요.
        </div>
      )}

      <header className="mt-3 mb-5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-white/75 dark:bg-zinc-900 px-4 py-4 md:px-5 md:py-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
          {/* 사진 + 이름 + 연락처 */}
          <div className="min-w-0 flex items-start gap-3 lg:shrink-0">
            <FacePhotoUpload
              memberId={member.id}
              current={member.face_image_data}
              canEdit={canEditBasic}
              onSaved={load}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[22px] md:text-[26px] leading-tight font-bold text-[#2A251D] dark:text-zinc-100">
                  {member.name}
                </h1>
                {member.linked_firebase_uid ? (
                  <span
                    className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11.5px] font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60"
                    title="회원앱에 로그인해 CRM 레코드와 계정이 연결된 상태예요."
                  >
                    앱 연동
                  </span>
                ) : (
                  <span
                    className="px-2 py-1 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200 text-[11.5px] font-semibold dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                    title="회원앱 계정과 아직 연결되지 않았어요. 회원이 앱에서 셀프 가입하면 자동 연동됩니다."
                  >
                    앱 미연동
                  </span>
                )}
                <span className={`px-2 py-1 rounded-full text-[11.5px] font-semibold ${
                  isMemberActive(member)
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-[#F5F0E5] text-[#8C8270] dark:bg-zinc-800 dark:text-zinc-400"
                }`}>
                  {isMemberActive(member) ? "이용중" : "확인 필요"}
                </span>
              </div>
              <div className="mt-3.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <HeaderInlineEdit
                    memberId={member.id}
                    field="phone"
                    value={member.phone}
                    placeholder="연락처 없음"
                    inputMode="tel"
                    formatDisplay={(v) => (v ? formatPhone(String(v)) : "연락처 없음")}
                    canEdit={canEditBasic}
                    onSaved={load}
                    className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100"
                  />
                  {member.email && (
                    <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">{member.email}</span>
                  )}
                </div>
                <div className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  <span className="text-[13.5px] text-[#8C8270] dark:text-zinc-500 mr-1">출석번호</span>
                  <HeaderInlineEdit
                    memberId={member.id}
                    field="attendance_no"
                    value={member.attendance_no}
                    placeholder="미지정"
                    inputMode="numeric"
                    numeric
                    canEdit={canEditUsage}
                    onSaved={load}
                    className="tabular-nums"
                  />
                </div>
                <CheckInButton
                  memberId={member.id}
                  centerId={foreignCenter ? Number(foreignCenter) : undefined}
                  onDone={load}
                />
                {member.linked_firebase_uid && (
                  <UnlinkAppButton memberId={member.id} canEdit={canEditBasic} onDone={load} />
                )}
              </div>
            </div>
          </div>

          {/* 요약 통계 — 사진/이름 옆 남는 공간 채움 */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {canDelete && (
              <div className="flex justify-end">
                <button
                  onClick={remove}
                  className="px-3 py-1 rounded-lg border border-red-200 dark:border-red-900 text-[12px] text-red-700 dark:text-red-300 hover:bg-red-50"
                >
                  회원 삭제
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 h-full">
              <SummaryMetric label="최종 만료" value={fmtExp(member.final_expire_at)} hint={expireHint(member.final_expire_at)} tone={expireTone(member.final_expire_at)} />
              <SummaryMetric label="누적 결제" value={`${formatWon(member.total_paid_won)}원`} hint={member.last_purchase_at ? `최근 ${member.last_purchase_at}` : "결제 기록 없음"} tone="money" />
              <SummaryMetric label="마지막 출석" value={member.last_attended_at ?? "—"} hint={attendanceHint(member.last_attended_at)} />
              <SummaryMetric label="보유 상품" value={`${currentHoldings}종`} hint={member.current_pass || member.current_membership ? "보유 내역 있음" : "보유 내역 없음"} />
            </div>
          </div>
        </div>
      </header>

      {/* 탭: 정보 / 예약내역 / 결제내역 / 운동기록 / 로그 */}
      <div className="mb-4 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800">
        {(["info", "reservations", "payments", "workout", "logs"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 -mb-px text-[13px] font-medium border-b-2 transition-colors
              ${tab === t
                ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A]"
                : "border-transparent text-[#8C8270] hover:text-[#3A342A]"
              }`}
          >
            {t === "info"
              ? "정보"
              : t === "reservations"
                ? "예약내역"
                : t === "payments"
                  ? "결제내역"
                  : t === "workout"
                    ? "운동기록"
                    : "로그"}
          </button>
        ))}
      </div>

      {tab === "logs" ? (
        <MemberLogsSection memberId={member.id} staffList={staffList} />
      ) : tab === "payments" ? (
        <MemberPaymentsSection
          memberId={member.id}
          canEdit={canEditSales}
          canRefund={canRefundSales}
          canDelete={canDeleteSales}
          onChanged={() => {
            load();
            setUsageReload((n) => n + 1);
          }}
          onEditPass={(passId) => {
            setPassStartEdit(true);
            setDetailPassId(passId);
          }}
          onEditMembership={(membershipId) => {
            const m = holdMs.find((x) => x.id === membershipId);
            if (m) setPaymentDetail({ ...membershipToDetail(m, staffName), startInEdit: true });
            else alert("회원권 정보를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.");
          }}
        />
      ) : tab === "reservations" ? (
        <MemberReservationsSection memberId={member.id} />
      ) : tab === "workout" ? (
        <MemberWorkoutLogsSection memberId={member.id} canEdit={canEditUsage} />
      ) : (
      <>
      {(hasHoldings || !readOnly) && (
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">현재 보유</div>
            {!readOnly && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setUsageOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] text-[12.5px] font-semibold hover:bg-[#6B7B3A]/5"
                >
                  + 회원권 발급
                </button>
                <button
                  onClick={() => setPassOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
                >
                  + 수강권 발급
                </button>
              </div>
            )}
          </div>
          {hasHoldings ? (
          <div className="flex flex-wrap gap-1.5 px-3.5 py-3 rounded-xl border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/60">
          {/* 회원권: 실제 레코드 우선(편집 가능), 없으면 스냅샷 */}
          {validHoldMs.length > 0
            ? validHoldMs.map((m) => (
                <SnapHoldingCard
                  key={`hm${m.id}`}
                  tag="회원권"
                  name={m.plan_name}
                  period={fmtPeriod(m.start_date, m.expires_at)}
                  onClick={() => setPaymentDetail(membershipToDetail(m, staffName))}
                />
              ))
            : holdingCards("회원권", member.current_membership, onSnapSelect)}
          {/* 수강권: 실제 레코드 우선(수강권 수정) */}
          {validHoldPasses.length > 0
            ? validHoldPasses.map((p) => (
                <SnapHoldingCard
                  key={`hp${p.id}`}
                  tag="수강권"
                  name={stripPassCountSuffix(p.lesson_kind)}
                  period={`잔여 ${p.remaining_sessions}/${p.total_sessions}회 · ${p.expires_at === "9999-12-31" ? "무기한" : `~${p.expires_at}`}`}
                  onClick={() => { setPassStartEdit(false); setDetailPassId(p.id); }}
                />
              ))
            : holdingCards("수강권", member.current_pass, onSnapSelect)}
          {/* 대여권: 실제 레코드 우선(편집 가능). 락커 대여권은 아래 락커 항목으로 합쳐 표시 */}
          {holdOtherRs.length > 0
            ? holdOtherRs.map((r) => (
                <SnapHoldingCard
                  key={`hr${r.id}`}
                  tag="대여권"
                  name={r.item_name}
                  period={fmtPeriod(r.start_date, r.expires_at)}
                  onClick={() => setPaymentDetail(rentalToDetail(r, staffName))}
                />
              ))
            : validHoldLockers.length === 0 && holdLockerCards.length === 0
              ? holdingCards("대여권", member.current_rental, onSnapSelect)
              : null}
          {/* 락커: 배정(자리) + 락커 대여권 을 하나로 합쳐 표시. 미배정이면 빨간 칩 */}
          {holdLockerCards.length > 0
            ? holdLockerCards.map((c) => (
                <SnapHoldingCard
                  key={c.key}
                  tag="락커"
                  name={c.assign ? `${c.assign.zone_name} ${c.assign.number}번` : c.name}
                  period={fmtPeriod(c.start, c.exp)}
                  lockerUnassigned={!c.assign}
                  onClick={
                    c.assign
                      ? () => setLockerOpen(true)
                      : c.rental
                        ? () => setPaymentDetail(rentalToDetail(c.rental!, staffName))
                        : () => setLockerOpen(true)
                  }
                />
              ))
            : member.current_locker &&
              splitTopLevel(member.current_locker).map((chunk, i) => {
                const { name, period } = splitNamePeriod(chunk);
                return (
                  <SnapHoldingCard
                    key={`locker-${i}`}
                    tag="락커"
                    name={name}
                    period={period}
                    onClick={() => setLockerOpen(true)}
                  />
                );
              })}
          </div>
          ) : (
            <div className="px-3.5 py-3 rounded-xl border border-dashed border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
              보유 중인 상품이 없어요. 오른쪽 발급 버튼으로 추가해 주세요.
            </div>
          )}
        </section>
      )}

      <MemoSection memberId={member.id} memo={member.memo} onSaved={load} />

      <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DetailSection title="기본 정보">
          <EditableInfoCard canEdit={canEditBasic} memberId={member.id} field="name" label="이름" value={member.name} type="text" onSaved={load} />
          <EditableInfoCard canEdit={canEditBasic} memberId={member.id} field="phone" label="연락처" value={member.phone} type="text" formatDisplay={(v) => (v ? formatPhone(String(v)) : "—")} onSaved={load} />
          <EditableInfoCard canEdit={canEditBasic} memberId={member.id} field="gender" label="성별" value={member.gender} type="select" options={[{ v: "M", l: "남" }, { v: "F", l: "여" }]} formatDisplay={(v) => (v ? GENDER_LABEL[v as "M" | "F" | "N"] ?? String(v) : "—")} onSaved={load} />
          <EditableInfoCard canEdit={canEditBasic} memberId={member.id} field="birth" label="생년월일" value={member.birth} type="date" onSaved={load} />
          <EditableInfoCard canEdit={canEditBasic} memberId={member.id} field="email" label="이메일" value={member.email} type="text" onSaved={load} />
          <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="address" label="주소" value={member.address} type="text" onSaved={load} />
        </DetailSection>

      <DetailSection title="등록 정보">
        <EditableInfoCard canEdit={canEditBasic} memberId={member.id} field="member_type" label="회원 유형" value={member.member_type} type="select" options={[{ v: "provisional", l: "가회원" }, { v: "full", l: "정회원" }, { v: "matched", l: "연동 회원" }]} formatDisplay={(v) => (v ? MEMBER_TYPE_LABEL[String(v)] ?? String(v) : "—")} onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="registration_type" label="신규/재등록" value={member.registration_type} type="select" options={[{ v: "신규", l: "신규" }, { v: "재등록", l: "재등록" }]} onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="registered_at" label="최근 등록일" value={member.registered_at} type="date" onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="first_use_at" label="이용 시작일" value={member.first_use_at} type="date" onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="final_expire_at" label="최종 만료일" value={member.final_expire_at} type="date" formatDisplay={(v) => fmtExp(v as string | null)} onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="last_purchase_at" label="마지막 구매일" value={member.last_purchase_at} type="date" onSaved={load} />
      </DetailSection>

      <DetailSection title="이용 정보">
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="last_attended_at" label="마지막 출석일" value={member.last_attended_at} type="date" onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="total_paid_won" label="누적 결제" value={member.total_paid_won} type="number" suffix="원" onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="attendance_no" label="출석번호" value={member.attendance_no} type="text" onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="workout_goal" label="운동 목적" value={member.workout_goal} type="text" onSaved={load} />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="mileage" label="마일리지" value={member.mileage} type="number" suffix="점" onSaved={load} />
      </DetailSection>

      <DetailSection title="관리 정보">
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="visit_route" label="방문 경로" value={member.visit_route} type="text" onSaved={load} />
        <EditableInfoCard
          canEdit={canEditUsage}
          memberId={member.id}
          field="counselor"
          label="상담 담당자"
          value={member.counselor}
          type="select"
          options={[
            { v: "", l: "지정 안 함" },
            ...staffList
              .filter((s) => s.status === "active")
              .map((s) => ({ v: s.display_name, l: s.display_name })),
          ]}
          onSaved={load}
        />
        <EditableInfoCard canEdit={canEditUsage} memberId={member.id} field="marketing_consent" label="광고성 수신" value={member.marketing_consent} type="bool" onSaved={load} />
      </DetailSection>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            수강권 ({passes.length})
          </h2>
        </div>
        {passes.length === 0 ? (
          member.current_pass ? (
            <ul className="space-y-2">
              {splitTopLevel(member.current_pass).map((chunk, i) => {
                const { name, period } = splitNamePeriod(chunk);
                return (
                  <li key={`snap-pass-${i}`}>
                    <button
                      onClick={() => onSnapSelect("수강권", name, period)}
                      className="w-full text-left px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/60 hover:border-[#6B7B3A]/50 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                          {name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500">
                          이전 기록
                        </span>
                      </div>
                      {period && (
                        <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">{period}</div>
                      )}
                      <div className="mt-0.5 text-[11.5px] text-[#A89B80]">
                        이전 POS 이관 · 정식 발급하면 잔여 횟수·강사 지정 및 수정이 가능합니다
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
              발급된 수강권이 없습니다.
            </div>
          )
        ) : (
          <ul className="space-y-2">
            {passes.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => { setPassStartEdit(false); setDetailPassId(p.id); }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                      {p.lesson_kind}
                    </span>
                    <PassStatusChip status={p.status} />
                  </div>
                  <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
                    {ISSUE_TYPE_LABEL[p.issue_type] ?? p.issue_type} ·{" "}
                    잔여 {p.remaining_sessions}/{p.total_sessions}회 ·{" "}
                    {p.session_minutes}분 · {formatWon(p.price_won)}원 ·{" "}
                    {p.payment_method === "etc" && p.payment_method_custom
                      ? p.payment_method_custom
                      : PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[#A89B80]">
                    발급 {p.issued_at} · 만료{" "}
                    {p.expires_at === "9999-12-31" ? "무기한" : p.expires_at}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <UsageSection
        memberId={member.id}
        reloadKey={usageReload}
        staffList={staffList}
        onOpenDetail={setPaymentDetail}
        onOpenLocker={() => setLockerOpen(true)}
      />

      <HoldingDetailModal
        detail={paymentDetail}
        memberId={member.id}
        memberName={member.name}
        onClose={() => setPaymentDetail(null)}
        staffList={staffList}
        onSaved={() => setUsageReload((n) => n + 1)}
        onHold={(t) => {
          setPaymentDetail(null);
          setHoldTarget(t);
        }}
      />

      <LockerDetailModal
        open={lockerOpen}
        memberId={member.id}
        onClose={() => setLockerOpen(false)}
        onSaved={() => {
          setLockerOpen(false);
          load();
        }}
      />

      <HoldModal
        open={holdTarget !== null}
        passId={null}
        membershipId={holdTarget?.kind === "membership" ? holdTarget.id : null}
        rentalId={holdTarget?.kind === "rental" ? holdTarget.id : null}
        onClose={() => setHoldTarget(null)}
        onDone={() => {
          setHoldTarget(null);
          setUsageReload((n) => n + 1);
        }}
      />

      <SignedContractsSection memberId={member.id} />

      <BodyMeasurementSection memberId={member.id} onOpen={() => setBodyOpen(true)} reloadKey={bodyReload} />
      </>
      )}

      <BodyMeasurementModal
        memberId={member.id}
        open={bodyOpen}
        onClose={() => setBodyOpen(false)}
        onDone={() => {
          setBodyOpen(false);
          setBodyReload((n) => n + 1);
        }}
      />

      <PassIssueModal
        open={passOpen}
        onClose={() => setPassOpen(false)}
        memberId={member.id}
        staffList={staffList}
        myMemberId={myMemberId}
        onSuccess={(passId) => {
          setPassOpen(false);
          setPendingPassId(passId);
          setChoiceOpen(true);
          load();
        }}
      />
      <UsageIssueModal
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        memberId={member.id}
        memberMileage={member.mileage}
        staffList={staffList}
        myMemberId={myMemberId}
        onSuccess={() => {
          setUsageOpen(false);
          setUsageReload((n) => n + 1);
          load();
        }}
      />

      <PostIssueChoiceModal
        open={choiceOpen}
        onClose={() => {
          setChoiceOpen(false);
          setPendingPassId(null);
        }}
        onSign={() => {
          setChoiceOpen(false);
          setTemplatePickerOpen(true);
        }}
        onSkip={() => {
          setChoiceOpen(false);
          setPendingPassId(null);
          setPurchaseDone(true);
        }}
      />

      <TemplatePickerModal
        open={templatePickerOpen}
        onClose={() => {
          setTemplatePickerOpen(false);
          setPendingPassId(null);
        }}
        memberId={member.id}
        passId={pendingPassId}
      />

      <PurchaseDoneBanner
        open={purchaseDone}
        onClose={() => setPurchaseDone(false)}
      />

      <PassDetailModal
        passId={detailPassId}
        staffList={staffList}
        startInEdit={passStartEdit}
        onClose={() => {
          setDetailPassId(null);
          setPassStartEdit(false);
        }}
        onRefunded={() => {
          setDetailPassId(null);
          setPassStartEdit(false);
          load();
        }}
      />
    </div>
  );
}

function MemoSection({
  memberId,
  memo,
  onSaved,
}: {
  memberId: number;
  memo: string | null;
  onSaved: () => void;
}) {
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memo ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(memo ?? "");
    setEditing(false);
  }, [memo]);

  const save = async (value: string) => {
    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ memo: value }),
      });
      if (res.ok) {
        setEditing(false);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500">메모</span>
        {!editing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setText(memo ?? "");
                setEditing(true);
              }}
              className="text-[11.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
            >
              {memo ? "수정" : "+ 메모 추가"}
            </button>
            {memo && (
              <button
                onClick={() => {
                  if (confirm("메모를 삭제할까요?")) save("");
                }}
                className="px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900/60 text-[11.5px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <div>
          <textarea
            className={`${crmInputClass} min-h-[64px]`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메모를 입력하세요"
            autoFocus
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              onClick={() => save(text.trim())}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setText(memo ?? "");
              }}
              className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]"
            >
              취소
            </button>
          </div>
        </div>
      ) : memo ? (
        <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
          {memo}
        </div>
      ) : (
        <div className="px-3.5 py-2 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#A89B80]">
          메모가 없습니다.
        </div>
      )}
    </div>
  );
}

/* 회원 상세 헤더 — 수동 출석 처리 버튼 */
function CheckInButton({
  memberId,
  centerId,
  onDone,
}: {
  memberId: number;
  centerId?: number;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/attendances/check-in", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ member_id: memberId, source: "manual", ...(centerId ? { center_id: centerId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "출석 처리 실패");
      if (data.duplicate) {
        setMsg({ text: data.message || "이미 최근에 출석 처리됐어요.", tone: "warn" });
      } else {
        const awarded = Number(data.mileage_awarded) || 0;
        setMsg({
          text: awarded > 0 ? `출석 처리했어요. (+${awarded.toLocaleString()}P 적립)` : "출석 처리했어요.",
          tone: "ok",
        });
        onDone();
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "네트워크 오류", tone: "warn" });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
      >
        {busy ? "처리 중…" : "출석 처리"}
      </button>
      {msg && (
        <span
          className={`text-[12px] font-medium ${
            msg.tone === "ok" ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#B47B2A]"
          }`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}

/* 회원 상세 헤더 — 앱 연동 해지 버튼 (연동된 회원에게만 노출) */
function UnlinkAppButton({
  memberId,
  canEdit,
  onDone,
}: {
  memberId: number;
  canEdit: boolean;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  const run = async () => {
    if (busy) return;
    if (
      !window.confirm(
        "이 회원의 앱 연동을 해제할까요?\n회원 데이터·이력은 그대로 유지되고, 앱 계정 연결과 앱 푸시만 끊깁니다."
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}/unlink`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "연동 해제 실패");
      setMsg({ text: "앱 연동을 해제했어요.", tone: "ok" });
      onDone();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "네트워크 오류", tone: "warn" });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  if (!canEdit) return null;

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[12.5px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
      >
        {busy ? "해제 중…" : "앱 연동 해지"}
      </button>
      {msg && (
        <span
          className={`text-[12px] font-medium ${
            msg.tone === "ok" ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#B47B2A]"
          }`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "good" | "warn" | "money";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
      ? "text-red-700 dark:text-red-300"
      : tone === "money"
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : "text-[#2A251D] dark:text-zinc-100";

  return (
    <div className="rounded-xl border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950/40 px-3 py-2.5 min-w-0">
      <div className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[15px] md:text-[16px] font-bold truncate ${toneClass}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-[#A89B80] dark:text-zinc-500 truncate">{hint}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-3.5 py-3">
      <h2 className="mb-2.5 text-[13px] font-bold text-[#3A342A] dark:text-zinc-200">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function isMemberActive(member: Member): boolean {
  if (member.status === "inactive") return false;
  if (!member.final_expire_at) return Boolean(member.current_membership || member.current_pass);
  return member.final_expire_at >= todayDate();
}

function expireTone(date: string | null): "default" | "good" | "warn" {
  if (!date) return "default";
  const days = daysFromToday(date);
  if (days === null) return "default";
  if (days < 0 || days <= 7) return "warn";
  return "good";
}

function expireHint(date: string | null): string {
  if (!date) return "만료일 없음";
  if (date.slice(0, 10) === "9999-12-31") return "무기한";
  const days = daysFromToday(date);
  if (days === null) return "날짜 확인 필요";
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘 만료";
  return `${days}일 남음`;
}

// 무기한(9999-12-31) 만료일은 "무기한" 으로 표시
function fmtExp(date: string | null | undefined): string {
  if (!date) return "—";
  return date.slice(0, 10) === "9999-12-31" ? "무기한" : date;
}

// ISO 시각 → "2026.08.07 16:36" (KST). 서버는 UTC 이므로 +9h.
function fmtPaidAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const mo = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const da = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${mo}.${da} ${hh}:${mi}`;
}

// 락커 비밀번호 자동 생성 — 4자리 숫자(앞자리 0 허용).
function genLockerPassword(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

// 수강권명 끝의 중복 횟수 표기 "(N회)" 제거 (잔여 X/Y회 로 이미 표시돼 불필요).
// 예: "점장 10회(10회)" → "점장 10회"
function stripPassCountSuffix(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\(\d+\s*회\)\s*$/, "").trim();
}

// 결제 상태 한글 라벨. paid/completed 는 정상 완료라 별도 표시하지 않음.
const PAYMENT_STATUS_KO: Record<string, string> = {
  partial: "부분 결제",
  unpaid: "미결제",
  pending: "대기",
  cancelled: "취소",
  canceled: "취소",
  refunded: "환불",
};

// "시작일 ~ 만료일" 표기. 만료일이 무기한이면 "시작일 ~ 무기한"
function fmtPeriod(start: string | null | undefined, end: string | null | undefined): string {
  const s = start ?? "—";
  return `${s} ~ ${fmtExp(end)}`;
}

function attendanceHint(date: string | null): string {
  if (!date) return "출석 기록 없음";
  const days = daysFromToday(date);
  if (days === null) return "날짜 확인 필요";
  if (days === 0) return "오늘 출석";
  if (days < 0) return `${Math.abs(days)}일 전`;
  return "미래 날짜";
}

function daysFromToday(date: string): number | null {
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00+09:00`);
  const today = Date.parse(`${todayDate()}T00:00:00+09:00`);
  if (!Number.isFinite(target) || !Number.isFinite(today)) return null;
  return Math.round((target - today) / 86400000);
}

function todayDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/* ─── 얼굴 사진 업로드 ────────────────────────────── */

/**
 * 회원 얼굴 사진.
 * • 파일 선택 → 클라이언트 압축 (300x300, JPEG q=0.75) → base64 data URL 로 PATCH
 * • 회원 상세 헤더의 아바타로 표시
 */
function FacePhotoUpload({
  memberId,
  current,
  canEdit,
  onSaved,
}: {
  memberId: number;
  current: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { getIdToken } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [camErr, setCamErr] = useState<{ kind: CamErrKind; msg: string } | null>(null);

  // 카메라 요청은 반드시 버튼 클릭(사용자 제스처) 안에서 즉시 호출해야
  // 크롬이 권한 팝업을 띄운다. 모달을 먼저 열고 요청하면 팝업이 안 뜬다.
  const openCamera = async () => {
    setError("");
    const r = await requestFaceCamera();
    if (r.stream) {
      setCamStream(r.stream);
      setCamErr(null);
    } else {
      setCamStream(null);
      setCamErr({ kind: r.errKind || "other", msg: r.errMsg || "카메라를 열 수 없어요" });
    }
    setCamOpen(true);
  };
  const closeCamera = () => {
    setCamOpen(false);
    setCamStream(null);
    setCamErr(null);
  };

  const onFile = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있어요");
      return;
    }
    setBusy(true);
    try {
      // 표시용 사진은 예전과 동일한 정도(420x420, q=0.85 ≈ 40KB) + 목록 썸네일(144x144).
      const [compressed, thumb] = await Promise.all([
        compressToDataUrl(file, 420, 0.85),
        compressToDataUrl(file, 144, 0.9),
      ]);
      // 얼굴 인식용 디스크립터는 "원본 고해상도"에서 계산 → 정확도↑ (표시 화질과 분리).
      // 실패(모델 로드/얼굴 미검출)해도 사진은 저장하고, 매칭은 얼굴출석에서 사진으로 폴백 처리됨.
      let descriptor: number[] | null = null;
      try {
        const objUrl = URL.createObjectURL(file);
        try {
          descriptor = await computeFaceDescriptor(objUrl);
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      } catch {
        descriptor = null;
      }
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          face_image_data: compressed,
          face_image_thumb: thumb,
          face_descriptor: descriptor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "업로드 실패");
      if (!descriptor) {
        setError("사진은 저장했지만 얼굴을 자동 인식하지 못했어요. 정면·밝은 곳에서 다시 촬영하면 인식률이 올라가요.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("얼굴 사진을 삭제할까요?")) return;
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ face_image_data: null, face_image_thumb: null, face_descriptor: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 min-w-[7rem]">
      {current ? (
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="사진 확대 보기"
          className="relative w-full aspect-square rounded-lg overflow-hidden border-2 border-[#E8E0D0] dark:border-zinc-700 bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center cursor-zoom-in hover:border-[#6B7B3A]/60 transition-colors"
        >
          {/* absolute → 이미지 실제 크기가 박스 폭 계산에 영향 못 주게. 박스는 w-full(버튼행 폭)로만 결정 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="얼굴" className="absolute inset-0 w-full h-full object-cover" />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px]">
              처리중…
            </div>
          )}
        </button>
      ) : (
        <div className="relative w-full aspect-square rounded-lg overflow-hidden border-2 border-[#E8E0D0] dark:border-zinc-700 bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
          <span className="text-[10px] text-[#A89B80]">사진 없음</span>
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px]">
              처리중…
            </div>
          )}
        </div>
      )}
      {zoomOpen && current && (
        <FaceZoomModal src={current} onClose={() => setZoomOpen(false)} />
      )}
      {canEdit && (
        <div className="flex flex-col items-center gap-1 w-full">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          {/* 기본 버튼 2개가 사진 박스 폭을 결정 → 사진 유무와 무관하게 동일 크기 유지 */}
          <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-sm border transition-colors disabled:opacity-50 ${
              current
                ? "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                : "border-[#6B7B3A] bg-[#6B7B3A] text-white hover:bg-[#5a6932]"
            }`}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2-2H10L8 7H5a2 2 0 00-2 2z" />
              <circle cx="12" cy="13" r="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {current ? "사진 변경" : "얼굴 등록"}
          </button>
          <button
            type="button"
            onClick={openCamera}
            disabled={busy}
            title="카메라로 촬영"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-sm border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <rect x="3" y="7" width="18" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l1.2-2h5.6L16 7" />
              <circle cx="12" cy="13.5" r="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            얼굴 촬영
          </button>
          </div>
          {current && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              삭제
            </button>
          )}
        </div>
      )}
      {camOpen && (
        <FaceCameraModal
          initialStream={camStream}
          initialErr={camErr}
          onClose={closeCamera}
          onCapture={(file) => { closeCamera(); onFile(file); }}
        />
      )}
      {error && (
        <div className="text-[10px] text-red-600 max-w-[90px] text-center">{error}</div>
      )}
    </div>
  );
}

type CamErrKind = "blocked" | "insecure" | "notfound" | "busy" | "other";

/**
 * 카메라 스트림 요청. 반드시 사용자 클릭(제스처) 안에서 호출해야 권한 팝업이 뜬다.
 * 성공 시 { stream }, 실패 시 { errKind, errMsg } 반환.
 */
async function requestFaceCamera(): Promise<{ stream?: MediaStream; errKind?: CamErrKind; errMsg?: string }> {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return { errKind: "insecure", errMsg: "보안 연결(HTTPS/localhost)에서만 카메라를 쓸 수 있어요" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { errKind: "insecure", errMsg: "이 주소에서는 카메라를 쓸 수 없어요 (HTTPS 필요)" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    return { stream };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { errKind: "blocked", errMsg: "카메라 권한이 차단되어 있어요" };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return { errKind: "notfound", errMsg: "연결된 카메라를 찾을 수 없어요" };
    }
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
      return { errKind: "busy", errMsg: "다른 앱/탭이 카메라를 사용 중이에요" };
    }
    return { errKind: "other", errMsg: "카메라를 열 수 없어요" };
  }
}

/**
 * 웹캠으로 회원 얼굴을 실시간 촬영하는 모달.
 * • 초기 스트림(initialStream)은 부모의 버튼 클릭 시점에 이미 요청됨(권한 팝업 목적)
 * • 스트림을 미리보기 (셀피처럼 좌우반전 표시)
 * • "촬영" → 캔버스로 캡처 → 좌우반전 없는 자연스러운 JPEG File 로 반환
 * • 반환된 File 은 얼굴 등록과 동일한 압축/저장 경로(onFile)를 탄다.
 */
function FaceCameraModal({
  initialStream,
  initialErr,
  onClose,
  onCapture,
}: {
  initialStream: MediaStream | null;
  initialErr: { kind: CamErrKind; msg: string } | null;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const aliveRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(initialErr?.msg ?? "");
  const [errKind, setErrKind] = useState<"" | CamErrKind>(initialErr?.kind ?? "");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const attachToVideo = useCallback((stream: MediaStream) => {
    streamRef.current = stream;
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    // autoPlay 로도 붙지만, 명시적 play + 성공/실패 모두 ready 처리로 확실히 미리보기 표시
    v.play().then(() => setReady(true)).catch(() => setReady(true));
  }, []);

  // 재획득 (재시도 버튼 클릭 등 사용자 제스처 or 권한 이미 허용된 상태에서 호출)
  const acquire = useCallback(async () => {
    setError("");
    setErrKind("");
    setReady(false);
    stopStream();
    const r = await requestFaceCamera();
    if (!aliveRef.current) {
      r.stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (r.stream) {
      attachToVideo(r.stream);
    } else {
      setErrKind(r.errKind || "other");
      setError(r.errMsg || "카메라를 열 수 없어요");
    }
  }, [stopStream, attachToVideo]);

  useEffect(() => {
    aliveRef.current = true;
    // 초기 스트림이 살아있으면 그대로 사용. StrictMode 재마운트 등으로 죽었거나 없고
    // 에러도 아니면(=권한은 이미 허용됨) 조용히 재획득한다.
    const live = !!initialStream && initialStream.getVideoTracks().some((t) => t.readyState === "live");
    if (live && initialStream) {
      attachToVideo(initialStream);
    } else if (!initialErr) {
      acquire();
    }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      aliveRef.current = false;
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      stopStream();
    };
    // 마운트 시 1회 — initialStream/initialErr 는 이 모달 인스턴스 동안 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // 중앙 정사각형 crop → 얼굴이 중앙에 크게 담기도록
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `face-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E8E0D0] dark:border-zinc-800 text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          얼굴 촬영
        </div>
        <div className="p-4">
          <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
            {/* 셀피처럼 좌우반전 미리보기 */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setReady(true)}
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {!ready && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-[12px]">
                카메라 준비중…
              </div>
            )}
            {/* 얼굴 가이드 원 */}
            {ready && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[62%] h-[78%] rounded-full border-2 border-white/60" />
              </div>
            )}
          </div>
          {error && (
            <div className="mt-3 space-y-1.5">
              <div className="text-[12.5px] font-semibold text-red-600 text-center">{error}</div>
              {errKind === "blocked" && (
                <p className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed text-center">
                  주소창 왼쪽의 <span className="font-semibold">🔒 / 카메라 아이콘</span> → <span className="font-semibold">카메라 허용</span> → 페이지 새로고침 후 다시 시도해 주세요.
                </p>
              )}
              {errKind === "insecure" && (
                <p className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed text-center">
                  브라우저 보안 정책상 카메라는 <span className="font-semibold">https 주소</span>에서만 열려요. 아래 <span className="font-semibold">사진으로 등록</span>을 이용하시면 휴대폰에서는 카메라가 바로 열립니다.
                </p>
              )}
              {errKind === "notfound" && (
                <p className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed text-center">
                  다른 앱이 카메라를 쓰고 있지 않은지 확인하고 다시 시도해 주세요.
                </p>
              )}
              {errKind === "busy" && (
                <p className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed text-center">
                  줌·팀즈·다른 브라우저 탭 등 카메라를 쓰는 앱/탭을 모두 닫고 다시 시도해 주세요.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 카메라가 막혀도 항상 쓸 수 있는 파일/기기카메라 대체 경로 */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onCapture(f);
          }}
        />

        <div className="px-4 pb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            취소
          </button>
          {error ? (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex-1 px-3 py-2 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] text-[13px] font-semibold hover:bg-[#6B7B3A]/5"
              >
                사진으로 등록
              </button>
              <button
                type="button"
                onClick={acquire}
                className="flex-1 px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
              >
                다시 시도
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={capture}
              disabled={!ready}
              className="flex-1 px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-40"
            >
              촬영
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 얼굴 사진 확대 보기 모달. 백드롭 or ESC or 사진 클릭 → 닫힘.
 */
function FaceZoomModal({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80" />
      <div className="relative max-w-[92vw] max-h-[92vh] flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="얼굴 사진 확대"
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain bg-black/20"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/90 text-[#2A251D] text-[13px] font-semibold hover:bg-white shadow-lg"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

/**
 * 이미지 파일 → 정사각형 캔버스에 축소 → JPEG base64 반환.
 * 얼굴 알아볼 정도의 크기(기본 300x300) · 품질 0.75 → 대략 20~35KB.
 * center-crop 으로 얼굴이 중앙에 크게 담기도록.
 */
async function compressToDataUrl(file: File, size: number, quality: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 컨텍스트 생성 실패");
    // 부드러운 다운스케일링 → 픽셀 지글거림 최소화
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // center-crop: 원본에서 정사각형 영역을 잘라 캔버스에 채움
    const srcSide = Math.min(img.width, img.height);
    const sx = (img.width - srcSide) / 2;
    const sy = (img.height - srcSide) / 2;
    ctx.drawImage(img, sx, sy, srcSide, srcSide, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ─── 회원 예약내역 (달력 + 리스트 + 통계) ────────────────────────────── */

interface ReservationRow {
  id: number;
  pass_id: number | null;
  trainer_member_id: number;
  trainer_name: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  consumed: boolean;
  attended_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  pass: { lesson_kind: string; session_minutes: number } | null;
}

const STATUS_LABEL_R: Record<string, string> = {
  booked: "예약",
  attended: "정상 출석",
  cancelled: "예약 취소",
  noshow: "노쇼",
};
const STATUS_STYLE_R: Record<string, string> = {
  booked: "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A]",
  attended: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled: "bg-[#F5F0E5] text-[#8C8270] dark:bg-zinc-800 dark:text-zinc-400",
  noshow: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function MemberReservationsSection({ memberId }: { memberId: number }) {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monthYm, setMonthYm] = useState(() => {
    const d = new Date();
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
        const res = await fetch(`/api/crm/members/${memberId}/reservations`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setRows(data.reservations ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, getIdToken]);

  // KST 기준 상태별 집계 + 월별 예약 카운트
  const kstDate = (iso: string) => {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  };
  const attended = rows.filter((r) => r.status === "attended").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const noshow = rows.filter((r) => r.status === "noshow").length;
  const booked = rows.filter((r) => r.status === "booked").length;
  const monthCount = rows.filter((r) => kstDate(r.starts_at).slice(0, 7) === monthYm).length;

  const shiftMonth = (delta: number) => {
    const [y, m] = monthYm.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonthYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  // 이번달 기준 전 달 ymStr 계산
  const prevYm = (() => {
    const [y, m] = monthYm.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();

  if (loading) return <div className="py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>;
  if (error)
    return (
      <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
        {error}
      </div>
    );

  const today = (() => {
    const now = new Date();
    const k = new Date(now.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-4">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatMini label="총 예약" value={rows.length} tone="olive" />
        <StatMini label="정상 출석" value={attended} tone="emerald" />
        <StatMini label="예약 취소" value={cancelled} tone="gray" />
        <StatMini label="노쇼" value={noshow} tone="red" />
        <StatMini label={`${monthYm.slice(5)}월 예약`} value={monthCount} tone="amber" />
      </div>

      {/* 예약 대기 표시 (booked) */}
      {booked > 0 && (
        <div className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
          예약 대기(booked) {booked}건은 아직 진행 전
        </div>
      )}

      {/* 달력: 전 달 + 이번달 좌우 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="px-2 py-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A]"
        >
          ‹ 이전
        </button>
        <div className="text-[11.5px] text-[#8C8270]">
          <LegendDot color="bg-[#6B7B3A]" label="예약" />
          <span className="mx-2" />
          <LegendDot color="bg-emerald-500" label="정상 출석" />
          <span className="mx-2" />
          <LegendDot color="bg-red-500" label="노쇼" />
          <span className="mx-2" />
          <LegendDot color="bg-[#A89B80]" label="예약 취소" />
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="px-2 py-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A]"
        >
          다음 ›
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MiniMonthCalendar ymStr={prevYm} rows={rows} kstDate={kstDate} today={today} muted />
        <MiniMonthCalendar ymStr={monthYm} rows={rows} kstDate={kstDate} today={today} />
      </div>

      {/* 리스트 (전체 최근 500건) */}
      <div>
        <div className="mb-2 text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          예약 이력 ({rows.length}건, 최신순)
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            예약 내역이 없습니다.
          </div>
        ) : (
          <ul className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800 max-h-[520px] overflow-y-auto">
            {rows.map((r) => {
              const d = new Date(r.starts_at);
              const k = new Date(d.getTime() + 9 * 3600 * 1000);
              const dateStr = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
              const hm = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
              const eD = new Date(r.ends_at);
              const eK = new Date(eD.getTime() + 9 * 3600 * 1000);
              const hmE = `${String(eK.getUTCHours()).padStart(2, "0")}:${String(eK.getUTCMinutes()).padStart(2, "0")}`;
              return (
                <li key={r.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                        {dateStr}
                      </span>
                      <span className="text-[12px] text-[#8C8270]">
                        {hm} ~ {hmE}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${STATUS_STYLE_R[r.status] ?? ""}`}
                      >
                        {STATUS_LABEL_R[r.status] ?? r.status}
                      </span>
                    </div>
                    <span className="text-[11.5px] text-[#A89B80]">
                      {r.trainer_name ?? "—"}
                    </span>
                  </div>
                  {r.pass && (
                    <div className="mt-0.5 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
                      {r.pass.lesson_kind} · {r.pass.session_minutes}분
                    </div>
                  )}
                  {r.cancelled_reason && (
                    <div className="mt-0.5 text-[11px] text-red-600">
                      취소 사유: {r.cancelled_reason}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "olive" | "emerald" | "red" | "gray" | "amber";
}) {
  const cls =
    tone === "olive"
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "red"
      ? "text-red-600 dark:text-red-300"
      : tone === "amber"
      ? "text-[#B47B2A] dark:text-amber-300"
      : "text-[#8C8270] dark:text-zinc-400";
  return (
    <div className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[11px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-[18px] font-bold ${cls}`}>
        {value.toLocaleString()}
        <span className="text-[11px] ml-0.5 font-medium text-[#8C8270]">건</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </span>
  );
}

/**
 * 예약내역 탭에서 쓰는 미니 월 달력.
 * ymStr='YYYY-MM' 기준 해당 월 셀 렌더. muted=true 이면 전 달용 옅은 톤.
 */
function MiniMonthCalendar({
  ymStr,
  rows,
  kstDate,
  today,
  muted,
}: {
  ymStr: string;
  rows: ReservationRow[];
  kstDate: (iso: string) => string;
  today: string;
  muted?: boolean;
}) {
  const [yy, mm] = ymStr.split("-").map(Number);
  const daysInMonthMap = new Map<string, ReservationRow[]>();
  for (const r of rows) {
    const d = kstDate(r.starts_at);
    if (d.slice(0, 7) !== ymStr) continue;
    const list = daysInMonthMap.get(d) ?? [];
    list.push(r);
    daysInMonthMap.set(d, list);
  }
  const firstDay = new Date(Date.UTC(yy, mm - 1, 1));
  const startWeekday = firstDay.getUTCDay();
  const lastDate = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push({ date: null, day: null });
  for (let d = 1; d <= lastDate; d += 1) {
    const ymd = `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: ymd, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });

  return (
    <div
      className={`rounded-xl border border-[#E8E0D0] dark:border-zinc-800 overflow-hidden ${
        muted ? "bg-[#FBF7EB]/50 dark:bg-zinc-900/40" : "bg-[#FEFCF7] dark:bg-zinc-900"
      }`}
    >
      <div className="px-3 py-2 border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/60 text-center text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
        {yy}년 {mm}월
      </div>
      <div className="grid grid-cols-7 text-[11px] text-[#8C8270] border-b border-[#E8E0D0]/60 dark:border-zinc-800">
        {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
          <div
            key={i}
            className={`px-1 py-1.5 text-center ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const list = c.date ? daysInMonthMap.get(c.date) ?? [] : [];
          const hasAttended = list.some((r) => r.status === "attended");
          const hasNoShow = list.some((r) => r.status === "noshow");
          const hasCancel = list.some((r) => r.status === "cancelled");
          const hasBooked = list.some((r) => r.status === "booked");
          const isToday = c.date === today;
          const wd = i % 7;
          return (
            <div
              key={i}
              className={`min-h-[48px] p-1 border-t border-l border-[#E8E0D0]/40 dark:border-zinc-800/60 ${
                isToday ? "bg-[#6B7B3A]/10" : ""
              } ${muted && !list.length ? "opacity-70" : ""}`}
              title={list.length ? `${c.date} · 예약 ${list.length}건` : undefined}
            >
              {c.day && (
                <>
                  <div
                    className={`text-[10.5px] font-medium ${
                      wd === 0 ? "text-red-500" : wd === 6 ? "text-blue-500" : "text-[#3A342A] dark:text-zinc-300"
                    }`}
                  >
                    {c.day}
                  </div>
                  {list.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {hasAttended && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="정상 출석" />}
                      {hasNoShow && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="노쇼" />}
                      {hasCancel && <span className="w-1.5 h-1.5 rounded-full bg-[#A89B80]" title="예약 취소" />}
                      {hasBooked && <span className="w-1.5 h-1.5 rounded-full bg-[#6B7B3A]" title="예약" />}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 회원 결제내역 ────────────────────────────── */

interface PaymentRow {
  id: number;
  member_id: number;
  pass_id: number | null;
  membership_id: number | null;
  amount_won: number;
  method: string;
  method_custom: string | null;
  paid_at: string;
  note: string | null;
  status: string;
  created_at: string;
  product_name?: string | null;
  handler_name?: string | null;
}

const PAYMENT_METHOD_KO: Record<string, string> = {
  cash: "현금",
  card: "카드",
  transfer: "계좌이체",
  etc: "기타",
};

/* ─── 운동 기록 섹션 ─────────────────────────────
   회원 상세 · 운동기록 탭.
   - 날짜 선택 + 메모 입력으로 코칭 노트를 남김
   - 여러 건/날짜 허용 (트레이너/스태프 시점 코멘트)
   - PATCH/DELETE 지원
*/
interface WorkoutLog {
  id: number;
  log_date: string;
  memo: string;
  created_by_uid: string | null;
  created_at: string;
  updated_at: string;
}
function MemberWorkoutLogsSection({ memberId, canEdit }: { memberId: number; canEdit: boolean }) {
  const { getIdToken } = useAuth();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [logDate, setLogDate] = useState<string>(() =>
    new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  // 인라인 편집
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/members/${memberId}/workout-logs`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setLogs(data.logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!memo.trim()) {
      setError("운동 내용을 입력해 주세요");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}/workout-logs`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ log_date: logDate, memo: memo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setMemo("");
      setOpenForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (log: WorkoutLog) => {
    setEditingId(log.id);
    setEditDate(log.log_date);
    setEditMemo(log.memo);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    if (!editMemo.trim()) return;
    setEditSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(
        `/api/crm/members/${memberId}/workout-logs/${editingId}`,
        {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ log_date: editDate, memo: editMemo.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setEditSaving(false);
    }
  };
  const remove = async (id: number) => {
    if (!window.confirm("이 운동 기록을 삭제할까요?")) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}/workout-logs/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  return (
    <section className="space-y-3">
      {/* 상단 CTA */}
      {canEdit && !openForm && (
        <button
          type="button"
          onClick={() => {
            setOpenForm(true);
            setError("");
            setLogDate(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
            setMemo("");
          }}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border-2 border-dashed border-[#6B7B3A]/60 bg-gradient-to-r from-[#F3F7EA] to-white dark:from-emerald-950/20 dark:to-zinc-900 hover:border-[#6B7B3A] hover:bg-[#EFE7D5]/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#6B7B3A] text-white text-[16px] font-bold">
              +
            </span>
            <div className="min-w-0 text-left">
              <div className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">
                운동 기록 입력하기
              </div>
              <div className="mt-0.5 text-[11.5px] text-[#6B5D47] dark:text-zinc-400 truncate">
                날짜 선택 + 자유 메모로 회원의 운동 세션을 기록해요.
              </div>
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-[#6B7B3A]">시작 →</span>
        </button>
      )}

      {/* 입력 폼 */}
      {openForm && (
        <div className="rounded-2xl border-2 border-[#6B7B3A]/40 bg-[#FBF7EB]/40 dark:bg-emerald-950/20 p-3 md:p-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 shrink-0">
              날짜
            </span>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
            />
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 상체 데이 - 벤치 60kg 3x8, 랫풀다운 50kg 3x10, 컨디션 좋음"
            className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] leading-relaxed"
            maxLength={5000}
          />
          <div className="text-right text-[11px] text-[#A89B80]">
            {memo.length.toLocaleString()} / 5,000자
          </div>
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenForm(false);
                setError("");
              }}
              className="px-3.5 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#3A342A] dark:text-zinc-300 hover:bg-white"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="px-3.5 py-2 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
            >
              {saving ? "저장 중…" : "운동 기록 저장"}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="text-center py-8 text-[12.5px] text-[#8C8270]">불러오는 중…</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-[12.5px] text-[#A89B80]">
          아직 저장된 운동 기록이 없어요.
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-3"
            >
              {editingId === log.id ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-[#6B5D47] shrink-0">날짜</span>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="h-8 px-2.5 rounded-md border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12.5px]"
                    />
                  </div>
                  <textarea
                    value={editMemo}
                    onChange={(e) => setEditMemo(e.target.value)}
                    className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] leading-relaxed"
                    maxLength={5000}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-md border border-[#E8E0D0] text-[12px] text-[#3A342A] hover:bg-white"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={editSaving}
                      className="px-3 py-1.5 rounded-md bg-[#6B7B3A] text-white text-[12px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
                    >
                      {editSaving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[12.5px] font-bold text-[#6B7B3A] dark:text-[#A8B87A] tabular-nums">
                      {log.log_date}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(log)}
                          className="px-2 py-0.5 rounded text-[11px] text-[#6B5D47] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(log.id)}
                          className="px-2 py-0.5 rounded text-[11px] text-red-700 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[13.5px] text-[#2A251D] dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                    {log.memo}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberPaymentsSection({
  memberId,
  canEdit = false,
  canRefund = false,
  canDelete = false,
  onChanged,
  onEditPass,
  onEditMembership,
}: {
  memberId: number;
  canEdit?: boolean;
  canRefund?: boolean;
  canDelete?: boolean;
  onChanged?: () => void;
  // 결제항목 '수정' → 수강권/회원권 발급 창(편집 모드)으로 열기
  onEditPass?: (passId: number) => void;
  onEditMembership?: (membershipId: number) => void;
}) {
  const { getIdToken } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  // 인라인 수정 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("cash");
  const [editMethodCustom, setEditMethodCustom] = useState("");
  const [editPaidDate, setEditPaidDate] = useState("");
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/payments?member_id=${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setPayments(data.payments ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [memberId, getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(p: PaymentRow) {
    setEditingId(p.id);
    setEditAmount(String(p.amount_won ?? 0));
    setEditMethod(p.method || "cash");
    setEditMethodCustom(p.method_custom || "");
    setEditPaidDate(
      p.paid_at
        ? new Date(new Date(p.paid_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
        : ""
    );
    setEditNote(p.note || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: number) {
    setBusyId(id);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/payments/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          amount_won: Number(editAmount) || 0,
          method: editMethod,
          method_custom: editMethod === "etc" ? editMethodCustom : null,
          paid_at: editPaidDate || undefined,
          note: editNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditingId(null);
      await load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  async function refund(id: number) {
    if (!window.confirm("이 결제를 환불 처리할까요?\n환불하면 누적 결제 합계에서 제외됩니다.")) return;
    setBusyId(id);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/payments/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "refunded" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "환불 실패");
      await load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (
      !window.confirm(
        "이 결제를 삭제(구매 취소)할까요?\n연결된 회원권·수강권과 함께 발급된 묶음 구성(대여권·락커)까지 모두 삭제되고, 락커는 이전 상태로 되돌아갑니다.\n되돌릴 수 없습니다."
      )
    )
      return;
    setBusyId(id);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/payments/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      await load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  // 누적 = 환불 제외한 유효 결제 합계
  const total = payments.reduce((s, p) => s + (p.status === "refunded" ? 0 : p.amount_won ?? 0), 0);

  if (loading) return <div className="py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>;
  if (error)
    return (
      <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  if (payments.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
        결제내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
          총 {payments.length}건
        </span>
        <span className="text-[15px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
          누적 {total.toLocaleString()}원
        </span>
      </div>
      <ul className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
        {payments.map((p) => {
          const productLabel = p.product_name || "기타 결제";
          const methodLabel =
            p.method === "etc" && p.method_custom
              ? p.method_custom
              : PAYMENT_METHOD_KO[p.method] ?? p.method;
          const statusLabel = PAYMENT_STATUS_KO[p.status];
          const isRefunded = p.status === "refunded";
          const isEditing = editingId === p.id;
          const busy = busyId === p.id;
          return (
            <li key={p.id} className="px-4 py-3">
              {/* 1줄: 결제 상품 + 금액 */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 truncate">
                  {productLabel}
                </span>
                <span
                  className={`text-[14px] font-bold shrink-0 ${
                    isRefunded
                      ? "text-[#A89B80] line-through"
                      : "text-[#6B7B3A] dark:text-[#A8B87A]"
                  }`}
                >
                  {p.amount_won.toLocaleString()}원
                </span>
              </div>
              {/* 2줄: 결제수단 · 결제자 · 상태 */}
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#B47B2A]/10 text-[#B47B2A] dark:bg-amber-900/40 dark:text-amber-300">
                  {methodLabel}
                </span>
                {p.handler_name && (
                  <span className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
                    결제자 {p.handler_name}
                  </span>
                )}
                {statusLabel && (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {statusLabel}
                  </span>
                )}
              </div>
              {/* 3줄: 결제 일시 (KST) */}
              <div className="mt-1 text-[12px] text-[#A89B80]">
                {fmtPaidAt(p.paid_at)}
              </div>
              {p.note && (
                <div className="mt-1 text-[12px] text-[#6B5D47] dark:text-zinc-400 whitespace-pre-wrap">
                  {p.note}
                </div>
              )}

              {/* 인라인 수정 폼 */}
              {isEditing && (
                <div className="mt-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
                      금액(원)
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
                      />
                    </label>
                    <label className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
                      결제일
                      <input
                        type="date"
                        value={editPaidDate}
                        onChange={(e) => setEditPaidDate(e.target.value)}
                        className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
                      />
                    </label>
                    <label className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
                      결제수단
                      <select
                        value={editMethod}
                        onChange={(e) => setEditMethod(e.target.value)}
                        className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
                      >
                        <option value="cash">현금</option>
                        <option value="card">카드</option>
                        <option value="transfer">계좌이체</option>
                        <option value="etc">기타</option>
                      </select>
                    </label>
                    {editMethod === "etc" && (
                      <label className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
                        수단(직접입력)
                        <input
                          type="text"
                          value={editMethodCustom}
                          onChange={(e) => setEditMethodCustom(e.target.value)}
                          className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
                        />
                      </label>
                    )}
                  </div>
                  <label className="block text-[12px] text-[#6B5D47] dark:text-zinc-400">
                    메모
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
                    />
                  </label>
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={cancelEdit}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 bg-[#F0EAD9] dark:bg-zinc-800 disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => saveEdit(p.id)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-[#6B7B3A] disabled:opacity-50"
                    >
                      {busy ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              )}

              {/* 액션 버튼: 수정 / 환불 / 삭제 */}
              {!isEditing && (canEdit || canRefund || canDelete) && (
                <div className="mt-2 flex items-center gap-1.5">
                  {canEdit && (
                    <button
                      onClick={() => {
                        // 수강권/회원권 결제는 해당 발급 창(편집 모드)으로, 그 외엔 인라인 수정
                        if (p.pass_id && onEditPass) onEditPass(p.pass_id);
                        else if (p.membership_id && onEditMembership) onEditMembership(p.membership_id);
                        else startEdit(p);
                      }}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 bg-[#F0EAD9] dark:bg-zinc-800 disabled:opacity-50"
                    >
                      수정
                    </button>
                  )}
                  {canRefund && !isRefunded && (
                    <button
                      onClick={() => refund(p.id)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#B47B2A] bg-[#B47B2A]/10 dark:bg-amber-900/30 dark:text-amber-300 disabled:opacity-50"
                    >
                      환불
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => remove(p.id)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── 회원 변경 로그 (audit 이력) ────────────────────────────── */

interface AuditLog {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  actor_uid: string;
  actor_name: string | null;
  payload: unknown;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  "member.create": "회원 등록",
  "member.update": "회원 정보 수정",
  "member.delete": "회원 삭제",
  "pass.issue": "수강권 발급",
  "pass.update": "수강권 수정",
  "pass.refund": "수강권 환불",
  "membership.issue": "회원권 발급",
  "membership.update": "회원권 수정",
  "membership.refund": "회원권 환불",
  "rental.issue": "대여권/락커 발급",
  "rental.update": "대여권 수정",
  "rental.refund": "대여권 환불",
  "reservation.book": "예약 생성",
  "reservation.update": "예약 상태 변경",
  "reservation.reschedule": "예약 시간 이동",
  "reservation.cancel": "예약 취소",
  "reservation.attended": "출석 처리",
  "reservation.noshow": "노쇼 처리",
  "reservation.cancelled": "예약 취소",
  "contract.sign": "계약서 서명",
  "contract.request": "계약서 발송",
  "contract.void": "계약서 무효",
  "payment.add": "결제 추가",
  "pause.create": "홀딩 시작",
  "pause.update": "홀딩 수정",
  "message.broadcast": "메시지 발송",
  "attendance.cancel": "출석 취소",
  "member.face_register": "얼굴 등록",
};

// 로그 payload 필드 → 한글 라벨
const LOG_FIELD_LABEL: Record<string, string> = {
  name: "이름", phone: "연락처", email: "이메일", birth: "생년월일", gender: "성별",
  address: "주소", counselor: "상담사", visit_route: "방문 경로", workout_goal: "운동 목적",
  memo: "메모", note: "메모", registration_type: "신규/재등록", registered_at: "등록일",
  first_use_at: "이용 시작일", final_expire_at: "최종 만료일", last_purchase_at: "마지막 구매일",
  last_attended_at: "마지막 출석일", total_paid_won: "누적 결제", attendance_no: "출석번호",
  mileage: "마일리지", marketing_consent: "광고 수신", member_type: "회원 유형",
  face_image_data: "얼굴 사진", face_image_thumb: "얼굴 사진",
  price_won: "금액", amount_won: "금액", discount_won: "할인", expires_at: "만료일",
  start_date: "시작일", purchased_at: "구매일", issued_at: "발급일", vat_included: "부가세",
  payment_method: "결제 수단", payment_method_custom: "결제 수단(기타)", seller_member_id: "판매자",
  trainer_member_id: "담당 강사", plan_name: "상품명", duration_days: "기간", item_name: "상품",
  total_sessions: "총 세션", remaining_sessions: "잔여 세션", session_minutes: "수업 시간",
  issue_type: "발급 유형", lesson_kind: "수업 종류", mileage_earned: "적립 마일리지",
  mileage_used: "사용 마일리지", co_trainer_ids: "추가 강사", reason: "사유", requested_by: "요청자",
};
const LOG_MONEY_FIELDS = new Set(["price_won", "amount_won", "discount_won", "total_paid_won"]);
const LOG_IMAGE_FIELDS = new Set(["face_image_data", "face_image_thumb"]);
const LOG_ISSUE_TYPE: Record<string, string> = { new: "신규", renewal: "재등록", trial: "체험", service: "서비스" };

function MemberLogsSection({
  memberId,
  staffList = [],
}: {
  memberId: number;
  staffList?: { id: number; display_name: string }[];
}) {
  const { getIdToken } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
        const res = await fetch(`/api/crm/members/${memberId}/logs`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setLogs(data.logs ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, getIdToken]);

  if (loading) {
    return <div className="py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }
  if (logs.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
        아직 기록된 변경 이력이 없습니다.
      </div>
    );
  }

  const nameOf = (id: unknown): string => {
    const n = Number(id);
    return staffList.find((s) => s.id === n)?.display_name ?? (n ? `직원 #${n}` : "없음");
  };

  return (
    <div className="space-y-2">
      <div className="text-[11.5px] text-[#8C8270]">최근 {logs.length}건 · 최신순</div>
      <ul className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
        {logs.map((l) => {
          const summary = summarizeLog(l, nameOf);
          return (
            <li key={l.id} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A] shrink-0">
                    {ACTION_LABEL[l.action] ?? l.action}
                  </span>
                  {summary && (
                    <span className="text-[12.5px] text-[#3A342A] dark:text-zinc-200">{summary}</span>
                  )}
                </div>
                <span className="text-[11px] text-[#A89B80] shrink-0 whitespace-nowrap">
                  {formatLogTime(l.created_at)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-[#A89B80]">{l.actor_name ?? "—"}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 로그 payload → 사람이 읽는 한 줄 한글 요약 */
function summarizeLog(l: AuditLog, nameOf: (id: unknown) => string): string {
  if (!l.payload || typeof l.payload !== "object") return "";
  const p = l.payload as Record<string, unknown>;
  const fmt = (field: string, v: unknown): string => {
    if (LOG_IMAGE_FIELDS.has(field)) return v ? "등록" : "삭제";
    if (v === null || v === undefined || v === "") return "없음";
    if (field.endsWith("_member_id")) return nameOf(v);
    if (LOG_MONEY_FIELDS.has(field)) return `${Number(v).toLocaleString()}원`;
    if (field === "vat_included") return v ? "포함" : "미포함";
    if (field === "marketing_consent") return v ? "동의" : "미동의";
    if (field === "payment_method") return PAYMENT_METHOD_LABEL[String(v)] ?? String(v);
    if (field === "issue_type") return LOG_ISSUE_TYPE[String(v)] ?? String(v);
    if (field === "gender") return GENDER_LABEL[String(v) as "M" | "F" | "N"] ?? String(v);
    if (typeof v === "boolean") return v ? "예" : "아니오";
    if (typeof v === "number") return v.toLocaleString();
    if (typeof v === "string") {
      if (v.startsWith("data:image")) return "등록";
      return v.length > 30 ? v.slice(0, 30) + "…" : v;
    }
    if (Array.isArray(v)) return `${v.length}명`;
    return "";
  };

  // 회원 정보 수정: changes { field: {from, to} }
  const changes = p.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes && Object.keys(changes).length > 0) {
    return Object.entries(changes)
      .map(([k, v]) => {
        const label = LOG_FIELD_LABEL[k] ?? k;
        if (LOG_IMAGE_FIELDS.has(k)) return `${label} ${v.to ? "변경" : "삭제"}`;
        return `${label} ${fmt(k, v.from)}→${fmt(k, v.to)}`;
      })
      .join(" · ");
  }
  // 그 외 payload: 한글 라벨 요약 (핵심 필드만, 최대 5개)
  const parts = Object.entries(p)
    .filter(([k]) => k !== "member_id" && k !== "id")
    .map(([k, v]) => {
      if (LOG_IMAGE_FIELDS.has(k)) return `${LOG_FIELD_LABEL[k] ?? k} ${v ? "변경" : "삭제"}`;
      return `${LOG_FIELD_LABEL[k] ?? k} ${fmt(k, v)}`;
    })
    .filter(Boolean);
  return parts.slice(0, 5).join(" · ");
}

function formatLogTime(iso: string): string {
  try {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

/**
 * 인라인 수정 가능한 정보 카드. 필드별 hover 시 '수정' 노출, 클릭하면 인풋으로 전환.
 * 삭제는 없음 (메모 UX 를 정보 필드에 확장 · 사용자 요청).
 */
/**
 * 회원 상세 헤더(사진 옆) 인라인 편집.
 * 표시 텍스트 오른쪽에 연필 아이콘 → 클릭 시 입력창 + 저장/취소 노출.
 * 권한 없으면 연필 자체가 안 보임.
 */
function HeaderInlineEdit({
  memberId,
  field,
  value,
  placeholder,
  inputMode,
  numeric,
  formatDisplay,
  canEdit,
  onSaved,
  className,
}: {
  memberId: number;
  field: "phone" | "attendance_no";
  value: string | null;
  placeholder: string;
  inputMode?: "tel" | "numeric" | "text";
  numeric?: boolean;
  formatDisplay?: (v: string | null) => string;
  canEdit: boolean;
  onSaved: () => void;
  className?: string;
}) {
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const displayText = formatDisplay ? formatDisplay(value) : value ? String(value) : placeholder;
  const isEmpty = !value;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      let raw = draft.trim();
      if (numeric) raw = raw.replace(/\D+/g, "");
      const res = await fetch(`/api/crm/members/${memberId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ [field]: raw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="text"
          inputMode={inputMode}
          autoFocus
          className="min-w-[110px] max-w-[180px] px-2 py-1 rounded-md border border-[#6B7B3A] bg-white dark:bg-zinc-900 text-[13.5px] text-[#2A251D] dark:text-zinc-100 focus:outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(value ?? "");
              setEditing(false);
              setError("");
            }
          }}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-2 py-1 rounded-md bg-[#6B7B3A] disabled:opacity-60 text-white text-[11.5px] font-semibold hover:bg-[#5a6932]"
        >
          {saving ? "저장중" : "저장"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value ?? "");
            setEditing(false);
            setError("");
          }}
          className="text-[11.5px] text-[#8C8270] hover:underline"
        >
          취소
        </button>
        {error && <span className="text-[11px] text-red-600 ml-1">{error}</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <span className={isEmpty ? "text-[#A89B80] font-normal" : ""}>{displayText}</span>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[#A89B80] hover:text-[#6B7B3A] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          aria-label="수정"
          title="수정"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
    </span>
  );
}

function EditableInfoCard({
  memberId,
  field,
  label,
  value,
  type,
  options,
  suffix,
  formatDisplay,
  canEdit = true,
  onSaved,
}: {
  memberId: number;
  field: string;
  label: string;
  value: string | number | boolean | null;
  type: "text" | "date" | "number" | "select" | "bool";
  options?: { v: string; l: string }[];
  suffix?: string;
  formatDisplay?: (v: string | number | boolean | null) => string;
  canEdit?: boolean;
  onSaved: () => void;
}) {
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<string | boolean>(() => {
    if (type === "bool") return !!value;
    return value === null || value === undefined ? "" : String(value);
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (type === "bool") setDraft(!!value);
    else setDraft(value === null || value === undefined ? "" : String(value));
  }, [value, type]);

  const displayValue = (() => {
    if (formatDisplay) return formatDisplay(value);
    if (type === "bool") return value ? "동의" : "미동의";
    if (value === null || value === undefined || value === "") return "—";
    if (type === "number" && typeof value === "number") {
      return `${value.toLocaleString()}${suffix ?? ""}`;
    }
    return String(value) + (suffix ?? "");
  })();

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const payload: Record<string, unknown> = {};
      if (type === "bool") payload[field] = draft as boolean;
      else if (type === "number") {
        const n = Number(draft);
        if (!Number.isFinite(n) || n < 0) {
          setError("숫자를 확인해 주세요");
          setSaving(false);
          return;
        }
        payload[field] = n;
      } else {
        const text = (draft as string).trim();
        if ((field === "name" || field === "phone") && !text) {
          setError(`${label}을 입력해 주세요`);
          setSaving(false);
          return;
        }
        payload[field] = text || null;
      }
      const res = await fetch(`/api/crm/members/${memberId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group px-3 py-2 rounded-lg bg-white/60 dark:bg-zinc-950/40 border border-[#E8E0D0]/50 dark:border-zinc-800/60 hover:border-[#6B7B3A]/40 transition-colors">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[#A89B80] dark:text-zinc-500">{label}</span>
        {!editing && canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
          >
            수정
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1 space-y-1.5">
          {type === "text" && (
            <input
              type="text"
              value={draft as string}
              onChange={(e) => setDraft(e.target.value)}
              className={crmInputClass}
              autoFocus
            />
          )}
          {type === "date" && (
            <input
              type="date"
              value={draft as string}
              onChange={(e) => setDraft(e.target.value)}
              className={crmInputClass}
              autoFocus
            />
          )}
          {type === "number" && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={draft as string}
                onChange={(e) => setDraft(e.target.value)}
                className={crmInputClass}
                autoFocus
              />
              {suffix && <span className="text-[12px] text-[#8C8270]">{suffix}</span>}
            </div>
          )}
          {type === "select" && (
            <select
              value={draft as string}
              onChange={(e) => setDraft(e.target.value)}
              className={crmInputClass}
              autoFocus
            >
              <option value="">선택</option>
              {(options ?? []).map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          )}
          {type === "bool" && (
            <label className="flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
              <input
                type="checkbox"
                checked={draft as boolean}
                onChange={(e) => setDraft(e.target.checked)}
                className="w-4 h-4 accent-[#6B7B3A]"
              />
              동의
            </label>
          )}
          {error && (
            <div className="text-[11px] text-red-600">{error}</div>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1 rounded-lg bg-[#6B7B3A] text-white text-[11.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
            >
              {saving ? "…" : "저장"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError("");
                if (type === "bool") setDraft(!!value);
                else setDraft(value === null || value === undefined ? "" : String(value));
              }}
              disabled={saving}
              className="px-3 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[11.5px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-0.5 text-[13px] text-[#2A251D] dark:text-zinc-100 font-medium break-words">
          {displayValue}
        </div>
      )}
    </div>
  );
}

// 콤마로 구분된 보유 상품 문자열을 개별 항목으로 분리 (괄호 안 콤마는 무시)
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// "이름 (2026. 4. 13. ~ 2026. 7. 12.)" → { name, period }
function splitNamePeriod(s: string): { name: string; period: string | null } {
  const m = s.match(/^(.*?)\s*\(([^()]*~[^()]*)\)\s*$/);
  if (m) return { name: m[1].trim(), period: m[2].replace(/\s+/g, " ").trim() };
  return { name: s.trim(), period: null };
}

const SNAP_STYLE: Record<string, string> = {
  회원권: "border-[#6B7B3A]/40 bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]",
  수강권: "border-[#B47B2A]/40 bg-[#B47B2A]/10 text-[#B47B2A] dark:text-amber-300",
  대여권: "border-[#3E7C8C]/40 bg-[#3E7C8C]/10 text-[#3E7C8C] dark:text-cyan-300",
  락커: "border-[#8B6BB1]/40 bg-[#8B6BB1]/10 text-[#8B6BB1] dark:text-purple-300",
};

function SnapHoldingCard({
  tag,
  name,
  period,
  lockerUnassigned,
  onClick,
}: {
  tag: string;
  name: string;
  period: string | null;
  lockerUnassigned?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-col text-left rounded-lg border px-2.5 py-1.5 leading-tight hover:brightness-95 ${
        SNAP_STYLE[tag] ?? "border-[#E8E0D0] bg-[#F5F0E5] text-[#8C8270]"
      }`}
    >
      <span className="text-[9.5px] font-bold uppercase tracking-wide opacity-80">{tag}</span>
      <span className="flex items-center gap-1 text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
        {name}
        {lockerUnassigned && (
          <span className="px-1.5 py-0.5 rounded-full bg-red-500/12 text-red-600 dark:text-red-400 text-[9.5px] font-bold">
            미배정
          </span>
        )}
      </span>
      {period && <span className="text-[10.5px] text-[#A89B80] dark:text-zinc-500">{period}</span>}
    </button>
  );
}

function holdingCards(
  tag: string,
  text: string | null,
  onSelect?: (tag: string, name: string, period: string | null) => void
) {
  if (!text) return null;
  return splitTopLevel(text).map((chunk, i) => {
    const { name, period } = splitNamePeriod(chunk);
    return (
      <SnapHoldingCard
        key={`${tag}-${i}`}
        tag={tag}
        name={name}
        period={period}
        onClick={onSelect ? () => onSelect(tag, name, period) : undefined}
      />
    );
  });
}

interface MemberLocker {
  id: number;
  zone_id: number;
  zone_name: string;
  number: number | string;
  start_date: string | null;
  expires_at: string | null;
  password: string | null;
  memo: string | null;
}
interface LockerMoveTarget {
  id: number;
  zone_id: number;
  zone_name: string;
  number: number | string;
}

/** 회원 상세 '현재 보유' 락커 상세 — 락커 결제(락커만)·위치, 수정 시 락커 이동 */
function LockerDetailModal({
  open,
  memberId,
  onClose,
  onSaved,
}: {
  open: boolean;
  memberId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getIdToken } = useAuth();
  const [lockers, setLockers] = useState<MemberLocker[]>([]);
  const [payment, setPayment] = useState<{ total_won: number; last_at: string | null; count: number }>({
    total_won: 0,
    last_at: null,
    count: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 이동 편집
  const [editId, setEditId] = useState<number | null>(null);
  const [vacant, setVacant] = useState<LockerMoveTarget[]>([]);
  const [targetId, setTargetId] = useState<number | "">("");
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/lockers/of-member?member_id=${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setLockers(data.lockers ?? []);
      setPayment(data.payment ?? { total_won: 0, last_at: null, count: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId]);

  useEffect(() => {
    if (!open) return;
    setEditId(null);
    setTargetId("");
    load();
  }, [open, load]);

  const startMove = async (lockerId: number) => {
    setEditId(lockerId);
    setTargetId("");
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/lockers/vacant", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setVacant((await res.json()).lockers ?? []);
    } catch {
      /* ignore */
    }
  };

  const move = async () => {
    if (!editId || !targetId || moving) return;
    setMoving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/lockers/${editId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "move", to_locker_id: Number(targetId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "이동 실패");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setMoving(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="락커 상세" size="lg">
      {loading ? (
        <div className="py-6 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : lockers.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-[#8C8270]">배정된 락커가 없습니다.</div>
      ) : (
        <div className="space-y-4">
          {lockers.map((l) => (
            <div
              key={l.id}
              className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-900/40 px-4 py-3"
            >
              <div className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">
                {l.zone_name} · {l.number}번
              </div>
              <DetailGrid
                rows={[
                  ["이용 기간", fmtPeriod(l.start_date, l.expires_at)],
                  ["락커 대여료", `${formatWon(payment.total_won)}원`],
                  ["마지막 구매일", payment.last_at ?? "—"],
                  ...(l.password ? [["비밀번호", l.password] as [string, string]] : []),
                  ...(l.memo ? [["메모", l.memo] as [string, string]] : []),
                ]}
              />

              {editId === l.id ? (
                <div className="mt-3 rounded-xl border-2 border-[#6B7B3A]/40 bg-white dark:bg-zinc-900 p-3">
                  <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200 mb-2">
                    이동할 빈 락커 선택
                  </div>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : "")}
                    className={crmInputClass}
                  >
                    <option value="">빈 락커 선택</option>
                    {vacant.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.zone_name} · {v.number}번
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
                    현재 락커의 회원·기간·비밀번호가 선택한 빈 락커로 옮겨지고, 지금 락커는 비워집니다.
                  </p>
                  {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={move}
                      disabled={moving || !targetId}
                      className="flex-1 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
                    >
                      {moving ? "이동 중…" : "이 락커로 이동"}
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] text-[#6B5D47] dark:text-zinc-300"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startMove(l.id)}
                  className="mt-3 px-4 py-2 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[13px] font-semibold hover:bg-[#6B7B3A]/8"
                >
                  수정 (락커 위치 이동)
                </button>
              )}
            </div>
          ))}

          {error && !editId && <div className="text-[12px] text-red-600">{error}</div>}

          <div className="flex justify-end pt-1">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </CrmModal>
  );
}

function PassStatusChip({ status }: { status: string }) {
  const label = PASS_STATUS_LABEL[status] ?? status;
  const cls =
    status === "valid"
      ? "bg-[#EFE7D5] text-[#6B7B3A] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A]"
      : status === "expired"
      ? "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

interface MembershipRow {
  id: number;
  seller_member_id: number | null;
  plan_name: string;
  price_won: number;
  discount_won: number;
  mileage_earned: number;
  mileage_used: number;
  vat_included: boolean;
  payment_method: string;
  payment_method_custom: string | null;
  start_date: string;
  expires_at: string;
  status: string;
  memo: string | null;
  outstanding_won: number;
  payment_status: string;
  is_paused?: boolean;
  created_at: string;
}
interface RentalRow {
  id: number;
  seller_member_id: number | null;
  item_name: string;
  price_won: number;
  discount_won: number;
  mileage_earned: number;
  mileage_used: number;
  vat_included: boolean;
  payment_method: string;
  payment_method_custom: string | null;
  start_date: string;
  expires_at: string;
  status: string;
  memo: string | null;
  is_paused?: boolean;
  created_at: string;
}

interface PaymentDetail {
  tag: string;
  name: string;
  period: string | null;
  source: "record" | "snapshot";
  /** 편집용 (record 인 경우) */
  id?: number;
  kind?: "membership" | "rental";
  sellerMemberId?: number | null;
  startDate?: string | null;
  expiresAt?: string | null;
  status?: string;
  isPaused?: boolean;
  priceWon?: number;
  discountWon?: number;
  vatIncluded?: boolean;
  paymentMethod?: string | null;
  paymentCustom?: string | null;
  outstandingWon?: number | null;
  paymentStatus?: string | null;
  mileageEarned?: number | null;
  mileageUsed?: number | null;
  sellerName?: string | null;
  paidAt?: string | null;
  memo?: string | null;
  note?: string | null;
  /** 열자마자 편집(발급 창 형태) 모드로 시작 — 결제내역 '수정' 진입용 */
  startInEdit?: boolean;
}

function membershipToDetail(
  m: MembershipRow,
  sellerName: (id: number | null) => string | null
): PaymentDetail {
  return {
    tag: "회원권",
    name: m.plan_name,
    period: fmtPeriod(m.start_date, m.expires_at),
    source: "record",
    id: m.id,
    kind: "membership",
    sellerMemberId: m.seller_member_id,
    startDate: m.start_date,
    expiresAt: m.expires_at,
    status: m.status,
    isPaused: m.is_paused,
    priceWon: m.price_won,
    discountWon: m.discount_won,
    vatIncluded: m.vat_included,
    paymentMethod: m.payment_method,
    paymentCustom: m.payment_method_custom,
    outstandingWon: m.outstanding_won,
    paymentStatus: m.payment_status,
    mileageEarned: m.mileage_earned,
    mileageUsed: m.mileage_used,
    sellerName: sellerName(m.seller_member_id),
    paidAt: m.created_at,
    memo: m.memo,
  };
}

function rentalToDetail(
  r: RentalRow,
  sellerName: (id: number | null) => string | null
): PaymentDetail {
  return {
    tag: "대여권",
    name: r.item_name,
    period: fmtPeriod(r.start_date, r.expires_at),
    source: "record",
    id: r.id,
    kind: "rental",
    sellerMemberId: r.seller_member_id,
    startDate: r.start_date,
    expiresAt: r.expires_at,
    status: r.status,
    isPaused: r.is_paused,
    priceWon: r.price_won,
    discountWon: r.discount_won,
    vatIncluded: r.vat_included,
    paymentMethod: r.payment_method,
    paymentCustom: r.payment_method_custom,
    mileageEarned: r.mileage_earned,
    mileageUsed: r.mileage_used,
    sellerName: sellerName(r.seller_member_id),
    paidAt: r.created_at,
    memo: r.memo,
  };
}

// 락커 배정 레코드
type LockerAssignRow = {
  id: number;
  zone_name: string;
  number: number;
  start_date: string | null;
  expires_at: string | null;
};
// 락커 발급 = 대여권(락커) 행 + 물리 배정 이 함께 생겨 목록에 중복 표시됨.
// 배정 memo("남자탈의실 20번")로 대여권을 매칭해 하나로 합친다.
type MergedLocker = {
  key: string;
  name: string;
  price: number;
  start: string | null;
  exp: string | null;
  assign: LockerAssignRow | null; // null = 미배정
  rental: RentalRow | null;
};
function mergeLockerItems(
  lockers: LockerAssignRow[],
  rentals: RentalRow[]
): { cards: MergedLocker[]; usedRentalIds: Set<number> } {
  const used = new Set<number>();
  const cards: MergedLocker[] = [];
  // 1) 배정된 락커 → memo 로 매칭되는 대여권(락커) 결합
  for (const l of lockers) {
    const label = `${l.zone_name} ${l.number}번`;
    const r = rentals.find((x) => !used.has(x.id) && (x.memo ?? "").includes(label)) ?? null;
    if (r) used.add(r.id);
    cards.push({
      key: `la${l.id}`,
      name: r?.item_name ?? "락커",
      price: r?.price_won ?? 0,
      start: l.start_date,
      exp: l.expires_at,
      assign: l,
      rental: r,
    });
  }
  // 2) 배정 안 된 락커 대여권(미배정) — memo '미배정' 또는 락커/상가 상품명
  for (const x of rentals) {
    if (used.has(x.id)) continue;
    const isLocker = (x.memo ?? "").includes("미배정") || /^(락커|상가)/.test((x.item_name ?? "").trim());
    if (!isLocker) continue;
    used.add(x.id);
    cards.push({
      key: `lr${x.id}`,
      name: x.item_name,
      price: x.price_won,
      start: x.start_date,
      exp: x.expires_at,
      assign: null,
      rental: x,
    });
  }
  return { cards, usedRentalIds: used };
}

function UsageSection({
  memberId,
  reloadKey,
  staffList,
  onOpenDetail,
  onOpenLocker,
}: {
  memberId: number;
  reloadKey: number;
  staffList: { id: number; display_name: string; role: string; status: string }[];
  onOpenDetail: (d: PaymentDetail) => void;
  onOpenLocker: () => void;
}) {
  const { getIdToken } = useAuth();
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [rentals, setRentals] = useState<RentalRow[]>([]);
  const [lockers, setLockers] = useState<
    { id: number; zone_name: string; number: number; start_date: string | null; expires_at: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        if (!token) return;
        const headers = { authorization: `Bearer ${token}` };
        const [mRes, rRes, lRes] = await Promise.all([
          fetch(`/api/crm/memberships?member_id=${memberId}`, { headers, cache: "no-store" }),
          fetch(`/api/crm/rentals?member_id=${memberId}`, { headers, cache: "no-store" }),
          fetch(`/api/crm/lockers/of-member?member_id=${memberId}`, { headers, cache: "no-store" }),
        ]);
        if (mRes.ok) setMemberships((await mRes.json()).memberships ?? []);
        if (rRes.ok) setRentals((await rRes.json()).rentals ?? []);
        if (lRes.ok) {
          const lData = await lRes.json();
          setLockers(lData.lockers ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, reloadKey, getIdToken]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isValid = (s: string, exp: string) => s === "valid" && exp >= todayStr;
  const sellerName = (id: number | null) =>
    id ? staffList.find((s) => s.id === id)?.display_name ?? null : null;

  // 락커(배정) + 락커 대여권 을 하나로 합침. 남은 대여권 = 운동복 등.
  const { cards: lockerCards, usedRentalIds } = mergeLockerItems(lockers, rentals);
  const otherRentals = rentals.filter((r) => !usedRentalIds.has(r.id));
  const total = memberships.length + otherRentals.length + lockerCards.length;

  return (
    <section className="mt-6 mb-2">
      <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        회원권 · 대여권 · 락커 ({total})
      </h2>
      {loading && total === 0 ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : total === 0 ? (
        <div className="px-4 py-6 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          발급된 회원권·대여권·락커가 없습니다. &quot;+ 회원권 발급&quot;으로 추가해 주세요.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {memberships.map((m) => (
            <UsageCard
              key={`m${m.id}`}
              tag="회원권"
              name={m.plan_name}
              price={m.price_won}
              period={fmtPeriod(m.start_date, m.expires_at)}
              valid={isValid(m.status, m.expires_at)}
              paused={m.is_paused}
              onClick={() => onOpenDetail(membershipToDetail(m, sellerName))}
            />
          ))}
          {otherRentals.map((r) => (
            <UsageCard
              key={`r${r.id}`}
              tag="대여권"
              name={r.item_name}
              price={r.price_won}
              period={fmtPeriod(r.start_date, r.expires_at)}
              valid={isValid(r.status, r.expires_at)}
              paused={r.is_paused}
              onClick={() => onOpenDetail(rentalToDetail(r, sellerName))}
            />
          ))}
          {lockerCards.map((c) => (
            <UsageCard
              key={c.key}
              tag="락커"
              name={c.name}
              price={c.price}
              period={fmtPeriod(c.start, c.exp)}
              valid={c.assign ? !c.exp || c.exp >= todayStr : !!c.rental && isValid(c.rental.status, c.rental.expires_at)}
              lockerAssign={c.assign ? { zone_name: c.assign.zone_name, number: c.assign.number } : "unassigned"}
              onClick={c.assign ? onOpenLocker : c.rental ? () => onOpenDetail(rentalToDetail(c.rental!, sellerName)) : onOpenLocker}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UsageCard({
  tag,
  name,
  price,
  period,
  valid,
  paused,
  lockerAssign,
  onClick,
}: {
  tag: string;
  name: string;
  price: number;
  period: string;
  valid: boolean;
  paused?: boolean;
  // 락커 배정 상태 칩: 배정됨(구역·번호) / "unassigned"(미배정) / 없음
  lockerAssign?: { zone_name: string; number: number } | "unassigned";
  onClick: () => void;
}) {
  const tone =
    tag === "회원권"
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : tag === "락커"
        ? "text-[#8B6BB1] dark:text-purple-300"
        : "text-[#3E7C8C] dark:text-cyan-300";
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10.5px] font-bold ${tone}`}>{tag}</span>
            <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{name}</span>
            {lockerAssign === "unassigned" ? (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500/12 text-red-600 dark:text-red-400 text-[10px] font-bold">
                미배정
              </span>
            ) : lockerAssign ? (
              <>
                <span className="px-1.5 py-0.5 rounded-full bg-[#8B6BB1]/12 text-[#8B6BB1] dark:text-purple-300 text-[10px] font-semibold">
                  {lockerAssign.zone_name}
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-[#8B6BB1]/12 text-[#8B6BB1] dark:text-purple-300 text-[10px] font-bold">
                  {lockerAssign.number}번
                </span>
              </>
            ) : null}
            {paused && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#B47B2A]/12 text-[#B47B2A] dark:text-amber-300 text-[10px] font-semibold">
                홀딩중
              </span>
            )}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              valid
                ? "bg-transparent border border-[#4CAF50] text-[#4CAF50]"
                : "bg-[#F5F0E5] dark:bg-zinc-800 text-[#A89B80]"
            }`}
          >
            {valid ? "유효" : "만료"}
          </span>
        </div>
        <div className="mt-1 text-[11.5px] text-[#A89B80]">
          {period}
          {price > 0 && ` · ${formatWon(price)}원`}
          <span className="ml-1 text-[#6B7B3A] dark:text-[#A8B87A]">· 결제 상세 ›</span>
        </div>
      </button>
    </li>
  );
}

function HoldingDetailModal({
  detail,
  memberId,
  memberName,
  onClose,
  staffList,
  onSaved,
  onHold,
}: {
  detail: PaymentDetail | null;
  memberId: number;
  memberName: string;
  onClose: () => void;
  staffList: { id: number; display_name: string; role: string; status: string }[];
  onSaved: () => void;
  onHold: (target: { kind: "membership" | "rental"; id: number }) => void;
}) {
  const { getIdToken } = useAuth();
  const open = detail !== null;
  const [contractPickerOpen, setContractPickerOpen] = useState(false);
  const editable = !!detail && detail.source === "record" && !!detail.id && !!detail.kind;

  const [canEdit, setCanEdit] = useState(false);
  const [canRefund, setCanRefund] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [error, setError] = useState("");

  // 편집 폼 값
  const [ePrice, setEPrice] = useState(0);
  const [eDiscount, setEDiscount] = useState(0);
  const [eVat, setEVat] = useState(false);
  const [eMethod, setEMethod] = useState<string>("card");
  const [eMethodCustom, setEMethodCustom] = useState("");
  const [eSeller, setESeller] = useState<number | "">("");
  const [eStart, setEStart] = useState("");
  const [eExpires, setEExpires] = useState("");
  const [eMemo, setEMemo] = useState("");

  // 모달 열릴 때 권한 조회 + 편집 상태 초기화
  useEffect(() => {
    setEditing(false);
    setError("");
    if (!open) return;
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
          setCanEdit(!!data.permissions?.["sales.edit"]);
          setCanRefund(!!data.permissions?.["sales.refund"]);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [open, getIdToken]);

  const refund = async () => {
    if (!detail?.id || !detail.kind || refunding) return;
    const label = detail.kind === "rental" ? "대여권" : "회원권";
    if (!window.confirm(`이 ${label}을 환불 처리할까요? 환불 후에는 유효 상품 목록에서 제외됩니다.`)) return;
    setRefunding(true);
    setError("");
    try {
      const token = await getIdToken();
      const path = detail.kind === "rental" ? "rentals" : "memberships";
      const res = await fetch(`/api/crm/${path}/${detail.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "환불 실패");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setRefunding(false);
    }
  };

  const startEdit = () => {
    if (!detail) return;
    setEPrice(detail.priceWon ?? 0);
    setEDiscount(detail.discountWon ?? 0);
    setEVat(!!detail.vatIncluded);
    setEMethod(detail.paymentMethod || "card");
    setEMethodCustom(detail.paymentCustom || "");
    setESeller(detail.sellerMemberId ?? "");
    setEStart(detail.startDate ?? "");
    setEExpires(detail.expiresAt ?? "");
    setEMemo(detail.memo ?? "");
    setError("");
    setEditing(true);
  };

  // 결제내역 '수정' 진입 시(detail.startInEdit) 권한 확인 후 바로 편집 폼으로 시작
  useEffect(() => {
    if (open && detail?.startInEdit && editable && canEdit && !editing) startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canEdit, editable, detail?.startInEdit]);

  const saveEdit = async () => {
    if (!detail?.id || !detail.kind || saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const path = detail.kind === "membership" ? "memberships" : "rentals";
      const res = await fetch(`/api/crm/${path}/${detail.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          price_won: ePrice,
          discount_won: eDiscount,
          vat_included: eVat,
          payment_method: eMethod,
          payment_method_custom: eMethod === "etc" ? eMethodCustom : undefined,
          seller_member_id: eSeller || undefined,
          start_date: eStart || undefined,
          expires_at: eExpires || undefined,
          memo: eMemo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditing(false);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const paymentLabel =
    detail?.paymentMethod === "etc" && detail?.paymentCustom
      ? `${detail.paymentCustom} (기타)`
      : detail
        ? PAYMENT_METHOD_LABEL[detail.paymentMethod ?? ""] ?? detail.paymentMethod ?? "—"
        : "—";

  return (
    <>
    <CrmModal open={open} onClose={onClose} title="결제 상세">
      {!detail ? null : detail.source === "snapshot" ? (
        <div className="space-y-4">
          <div className="px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/60">
            <div className="text-[10.5px] font-bold text-[#8C8270]">{detail.tag}</div>
            <div className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">{detail.name}</div>
            {detail.period && (
              <div className="mt-0.5 text-[12px] text-[#A89B80]">{detail.period}</div>
            )}
          </div>
          <DetailGrid
            rows={[
              ["누적 결제", detail.priceWon ? `${formatWon(detail.priceWon)}원` : "—"],
              ["마지막 구매일", detail.paidAt ?? "—"],
            ]}
          />
          <div className="px-3 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12px] text-[#8C8270] leading-relaxed">
            {detail.note ??
              "POS에서 가져온 보유 내역이라 이 상품의 개별 결제 상세(담당자·결제일·할인 등)는 저장돼 있지 않아요. '회원권 발급'으로 새로 발급하면 상세가 기록됩니다."}
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
          >
            닫기
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/60">
            <div className="text-[10.5px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">{detail.tag}</div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">{detail.name}</span>
              <span className="flex items-center gap-1 shrink-0">
                {detail.isPaused && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    일시정지
                  </span>
                )}
                {detail.status && <PassStatusChip status={detail.status} />}
              </span>
            </div>
            {detail.period && (
              <div className="mt-0.5 text-[12px] text-[#A89B80]">{detail.period}</div>
            )}
          </div>
          <DetailGrid
            rows={[
              ["회원", memberName],
              ["판매 직원", detail.sellerName ?? "—"],
              ["발급일", detail.paidAt ? new Date(detail.paidAt).toISOString().slice(0, 10) : "—"],
              ...(detail.startDate
                ? ([["시작일", detail.startDate]] as [string, React.ReactNode][])
                : []),
              ...(detail.expiresAt
                ? ([["만료일", detail.expiresAt === "9999-12-31" ? "무기한" : detail.expiresAt]] as [string, React.ReactNode][])
                : []),
              [
                "결제 금액",
                `${formatWon(detail.priceWon ?? 0)}원${detail.vatIncluded ? " (부가세 포함)" : " (부가세 별도)"}`,
              ],
              [
                "할인 금액",
                (detail.discountWon ?? 0) > 0
                  ? `-${formatWon(detail.discountWon ?? 0)}원`
                  : "0원",
              ],
              [
                "최종 결제 금액",
                <span key="final" className="font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
                  {formatWon(Math.max(0, (detail.priceWon ?? 0) - (detail.discountWon ?? 0)))}원
                  {detail.vatIncluded ? " (부가세 포함)" : " (부가세 별도)"}
                </span>,
              ],
              ["결제 수단", paymentLabel],
              ...(detail.mileageUsed && detail.mileageUsed > 0
                ? ([["마일리지 사용", `-${detail.mileageUsed.toLocaleString()}P`]] as [string, React.ReactNode][])
                : []),
              ...(detail.mileageEarned && detail.mileageEarned > 0
                ? ([["마일리지 적립", <span key="me" className="text-[#6B7B3A] dark:text-[#A8B87A] font-semibold">+{detail.mileageEarned.toLocaleString()}P</span>]] as [string, React.ReactNode][])
                : []),
              ...(detail.outstandingWon && detail.outstandingWon > 0
                ? ([["미수금", <span key="o" className="text-red-600 dark:text-red-400 font-semibold">{formatWon(detail.outstandingWon)}원</span>]] as [string, React.ReactNode][])
                : detail.paymentStatus
                  ? ([["결제 상태", detail.paymentStatus === "paid" ? "완납" : detail.paymentStatus === "partial" ? "부분 결제" : "미결제"]] as [string, React.ReactNode][])
                  : []),
            ]}
          />
          {detail.memo && !editing && (
            <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
              <strong className="text-[#3A342A] dark:text-zinc-300">메모 ·</strong> {detail.memo}
            </div>
          )}

          {/* 회원권 상세: 전자 계약서 (수강권 상세와 동일 동작) */}
          {!editing && detail.kind === "membership" && detail.status === "valid" && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/crm/contracts/sign/new?member_id=${memberId}&membership_id=${detail.id}`}
                className="inline-flex px-3 py-1.5 rounded-lg border border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 text-[12.5px] font-semibold hover:bg-amber-50/60"
              >
                전자 계약서
              </Link>
              <button
                type="button"
                onClick={() => setContractPickerOpen(true)}
                className="inline-flex px-3 py-1.5 rounded-lg bg-[#B47B2A] text-white text-[12.5px] font-semibold hover:bg-[#9c682a]"
              >
                전자 계약서 작성 요청
              </button>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {editing ? (
            <div className="rounded-2xl border-2 border-[#6B7B3A]/40 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 p-4 space-y-3">
              <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">결제 상세 수정</div>
              <div className="grid grid-cols-2 gap-3">
                <CrmField label="결제 금액(원)">
                  <input
                    className={`${crmInputClass} text-right`}
                    value={ePrice ? formatWon(ePrice) : ""}
                    onChange={(e) => setEPrice(parseWon(e.target.value))}
                    inputMode="numeric"
                  />
                </CrmField>
                <CrmField label="할인(원)">
                  <input
                    className={`${crmInputClass} text-right`}
                    value={eDiscount ? formatWon(eDiscount) : ""}
                    onChange={(e) => setEDiscount(parseWon(e.target.value))}
                    inputMode="numeric"
                  />
                </CrmField>
                <CrmField label="담당자">
                  <select
                    value={eSeller}
                    onChange={(e) => setESeller(e.target.value ? Number(e.target.value) : "")}
                    className={crmInputClass}
                  >
                    <option value="">선택</option>
                    {staffList
                      .filter((s) => s.status === "active")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display_name} ({s.role})
                        </option>
                      ))}
                  </select>
                </CrmField>
                <CrmField label="결제 수단">
                  <select
                    value={eMethod}
                    onChange={(e) => setEMethod(e.target.value)}
                    className={crmInputClass}
                  >
                    {(["card", "cash", "transfer", "etc"] as const).map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </CrmField>
                {eMethod === "etc" && (
                  <CrmField label="결제 수단 직접 입력">
                    <input
                      className={crmInputClass}
                      value={eMethodCustom}
                      onChange={(e) => setEMethodCustom(e.target.value)}
                      placeholder="예: 상품권"
                    />
                  </CrmField>
                )}
                <CrmField label="시작일">
                  <input
                    type="date"
                    className={crmInputClass}
                    value={eStart}
                    onChange={(e) => setEStart(e.target.value)}
                  />
                </CrmField>
                <CrmField label="만료일">
                  <input
                    type="date"
                    className={crmInputClass}
                    value={eExpires}
                    onChange={(e) => setEExpires(e.target.value)}
                  />
                </CrmField>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-300">
                <input type="checkbox" checked={eVat} onChange={(e) => setEVat(e.target.checked)} />
                부가세 포함 금액
              </label>
              <CrmField label="메모">
                <textarea
                  className={`${crmInputClass} min-h-[60px]`}
                  value={eMemo}
                  onChange={(e) => setEMemo(e.target.value)}
                />
              </CrmField>
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] text-[#6B5D47] dark:text-zinc-300"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {editable && detail.status === "valid" && (
                detail.isPaused ? (
                  <div className="px-3 py-2 rounded-lg bg-[#B47B2A]/10 text-[#B47B2A] dark:text-amber-300 text-[12.5px] text-center font-medium">
                    홀딩 중 (만료일이 홀딩 기간만큼 연장되었어요)
                  </div>
                ) : (
                  <button
                    onClick={() => detail.id && detail.kind && onHold({ kind: detail.kind, id: detail.id })}
                    className="w-full px-4 py-2.5 rounded-lg border border-[#B47B2A]/50 text-[#B47B2A] dark:text-amber-300 text-[13.5px] font-semibold hover:bg-[#B47B2A]/5"
                  >
                    ⏸ 홀딩 (일시정지)
                  </button>
                )
              )}
              <div className="flex gap-2">
                {editable && canEdit && (
                  <button
                    onClick={startEdit}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[13.5px] font-semibold hover:bg-[#6B7B3A]/5"
                  >
                    수정
                  </button>
                )}
                {editable && canRefund && detail.status === "valid" && (
                  <button
                    onClick={refund}
                    disabled={refunding}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[13.5px] font-semibold hover:bg-red-50 disabled:opacity-60"
                  >
                    {refunding ? "처리 중…" : "환불"}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                >
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </CrmModal>
    <ContractRequestPickerModal
      open={contractPickerOpen}
      memberId={memberId}
      membershipId={detail?.kind === "membership" ? detail.id : undefined}
      onClose={() => setContractPickerOpen(false)}
    />
    </>
  );
}

type UsageType = "membership" | "locker" | "apparel";

const USAGE_TABS: { key: UsageType; label: string }[] = [
  { key: "membership", label: "회원권" },
  { key: "locker", label: "락커" },
  { key: "apparel", label: "운동복" },
];

// 묶음 구성 상품 (crm_products.components 항목)
interface BundleComp {
  type: string;
  name?: string;
  price_won?: number;
  billing_mode?: string;
  duration_value?: number;
  duration_unit?: string;
  total_sessions?: number;
  session_minutes?: number;
}

// 무기한 만료 sentinel (count 기반 구성 수강권은 기간 개념이 없어 무기한으로).
const UNLIMITED_EXPIRY = "9999-12-31";

function addDaysYmd(startYmd: string, days: number): string {
  const d = new Date(`${startYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(1, days));
  return d.toISOString().slice(0, 10);
}

/**
 * 묶음 구성 상품 1건을 유형에 맞는 API로 발급. (판매 시 부모 상품과 함께 발급)
 * membership → /api/crm/memberships, locker·apparel → /api/crm/rentals,
 * personal·group(수강권) → /api/crm/passes (담당강사=판매자 기본).
 */
async function postBundleComponent(
  comp: BundleComp,
  args: {
    memberId: number;
    sellerId: number;
    trainerId: number;
    startDate: string;
    paymentMethod: string;
    paymentCustom?: string;
    token: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const headers = {
    authorization: `Bearer ${args.token}`,
    "content-type": "application/json",
  };
  const name = (comp.name || "").trim() || "구성 상품";
  const price = Math.max(0, Math.floor(comp.price_won ?? 0));
  const isCount = comp.billing_mode === "count";
  // 기간제 구성 상품: duration_value + duration_unit(일/개월/년) → 일수로 환산 (12개월=365)
  const durationDays = unitToDays(
    Math.max(0, Math.floor(comp.duration_value ?? 0)),
    comp.duration_unit ?? "day"
  );
  const expires = isCount
    ? UNLIMITED_EXPIRY
    : addDaysYmd(args.startDate, durationDays || 30);
  try {
    let res: Response;
    if (comp.type === "membership") {
      res = await fetch("/api/crm/memberships", {
        method: "POST",
        headers,
        body: JSON.stringify({
          member_id: args.memberId,
          seller_member_id: args.sellerId,
          plan_name: name,
          duration_days: durationDays || 30,
          price_won: price,
          payment_method: args.paymentMethod,
          payment_method_custom: args.paymentCustom,
          start_date: args.startDate,
          expires_at: expires,
        }),
      });
    } else if (comp.type === "apparel") {
      res = await fetch("/api/crm/rentals", {
        method: "POST",
        headers,
        body: JSON.stringify({
          member_id: args.memberId,
          seller_member_id: args.sellerId,
          item_name: name,
          price_won: price,
          payment_method: args.paymentMethod,
          payment_method_custom: args.paymentCustom,
          start_date: args.startDate,
          expires_at: expires,
        }),
      });
    } else if (comp.type === "locker") {
      // 묶음에 락커가 포함된 경우: 회원이 이미 배정받은 락커가 있으면
      // 그 자리를 그대로 이어서(기간 연장) 배정한다(미배정 방지).
      // 시작일 = 기존 락커 만료 다음날부터 체인(없으면 부모 시작일).
      let lockerStart = args.startDate;
      let existingLocker:
        | { id: number; zone_name: string; number: number; expires_at?: string | null }
        | null = null;
      try {
        const [nsRes, ofRes] = await Promise.all([
          fetch(`/api/crm/members/${args.memberId}/next-start?type=locker`, { headers }),
          fetch(`/api/crm/lockers/of-member?member_id=${args.memberId}`, {
            headers,
            cache: "no-store",
          }),
        ]);
        const ns = await nsRes.json().catch(() => ({}));
        if (nsRes.ok && ns?.start_date && ns?.chained) lockerStart = ns.start_date;
        const of = await ofRes.json().catch(() => ({}));
        const lks: Array<{ id: number; zone_name: string; number: number; expires_at?: string | null }> =
          Array.isArray(of?.lockers) ? of.lockers : [];
        // 만료일이 가장 늦은(가장 최근) 배정 락커 선택
        existingLocker =
          lks
            .slice()
            .sort((a, b) =>
              String(b.expires_at ?? "").localeCompare(String(a.expires_at ?? ""))
            )[0] ?? null;
      } catch {
        /* 조회 실패 시 미배정 대여권만 생성(기존 동작) */
      }
      const lockerExpires = addDaysYmd(lockerStart, durationDays || 30);
      res = await fetch("/api/crm/rentals", {
        method: "POST",
        headers,
        body: JSON.stringify({
          member_id: args.memberId,
          seller_member_id: args.sellerId,
          item_name: name,
          price_won: price,
          payment_method: args.paymentMethod,
          payment_method_custom: args.paymentCustom,
          start_date: lockerStart,
          expires_at: lockerExpires,
          memo: existingLocker
            ? `${existingLocker.zone_name} ${existingLocker.number}번`
            : "구역 미배정",
        }),
      });
      const rentalData = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: rentalData?.error || `${name} 발급 실패` };
      // 기존 락커를 같은 자리로 이어서 연장 배정
      if (existingLocker) {
        const aRes = await fetch(`/api/crm/lockers/${existingLocker.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            action: "assign",
            member_id: args.memberId,
            start_date: lockerStart,
            expires_at: lockerExpires,
          }),
        });
        if (!aRes.ok) {
          const ad = await aRes.json().catch(() => ({}));
          return { ok: false, error: ad?.error || "락커 이어배정 실패" };
        }
      }
      return { ok: true };
    } else {
      // personal | group (수강권)
      const totalSessions = Math.max(0, Math.floor(comp.total_sessions ?? 0));
      res = await fetch("/api/crm/passes", {
        method: "POST",
        headers,
        body: JSON.stringify({
          member_id: args.memberId,
          trainer_member_id: args.trainerId,
          seller_member_id: args.sellerId,
          issue_type: "new",
          lesson_kind: isCount ? `${name}(${totalSessions}회)` : name,
          total_sessions: totalSessions,
          session_minutes: Math.max(0, Math.floor(comp.session_minutes ?? 0)) || 50,
          price_won: price,
          payment_method: args.paymentMethod,
          payment_method_custom: args.paymentCustom,
          issued_at: args.startDate,
          start_date: args.startDate,
          expires_at: expires,
          billing_mode: isCount ? "count" : "period",
          group_capacity: comp.type === "group" ? 2 : 1,
        }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `${name} 발급 실패` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "네트워크 오류" };
  }
}

interface UsageProduct {
  id: number;
  name: string;
  price_won: number;
  duration_value: number | null;
  duration_unit: string | null;
  mileage_earn: number;
  mileage_usable: boolean;
  attendance_mileage_earn?: number;
  components?: BundleComp[];
}
interface VacantLocker {
  id: number;
  zone_id: number;
  zone_name: string;
  number: number;
}
interface PassProduct {
  id: number;
  name: string;
  price_won: number;
  total_sessions: number | null;
  session_minutes: number | null;
  service_days: number | null;
  duration_value: number | null;
  duration_unit: string | null;
  type?: string;
  capacity?: number | null;
  components?: BundleComp[];
}

function UsageIssueModal({
  open,
  onClose,
  memberId,
  memberMileage,
  staffList,
  myMemberId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  memberId: number;
  memberMileage: number;
  staffList: { id: number; display_name: string; role: string; status: string }[];
  myMemberId?: number | null;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [type, setType] = useState<UsageType>("membership");
  const [name, setName] = useState("");
  const [priceWon, setPriceWon] = useState(0);
  const [mileageEarn, setMileageEarn] = useState(0);
  const [mileageUsable, setMileageUsable] = useState(true);
  const [attendanceMileageEarn, setAttendanceMileageEarn] = useState(0);
  const [mileageUse, setMileageUse] = useState(0);
  const [discountWon, setDiscountWon] = useState(0);
  const [vatIncluded, setVatIncluded] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "etc">("card");
  const [paymentCustom, setPaymentCustom] = useState("");
  // 상품 선택 전에는 비어 있음. 상품 픽 → applyProduct 에서 자동 채움.
  const [startDate, setStartDate] = useState("");
  const [durationDays, setDurationDays] = useState<number>(0);
  const [memo, setMemo] = useState("");
  const [sellerId, setSellerId] = useState<number | "">("");
  const [products, setProducts] = useState<UsageProduct[]>([]);
  const [lockers, setLockers] = useState<VacantLocker[]>([]);
  const [lockerZone, setLockerZone] = useState<number | "">("");
  const [lockerId, setLockerId] = useState<number | "">("");
  const [lockerPassword, setLockerPassword] = useState("");
  // 회수 전 기존 배정 락커(만료 포함) — 있으면 그 자리를 이어서 배정하고 비밀번호를 유지한다.
  const [existingLocker, setExistingLocker] = useState<
    { id: number; zone_id: number; zone_name: string; number: number; password: string | null } | null
  >(null);
  const [showProducts, setShowProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 장바구니 — 여러 상품을 한 번의 결제로 처리하기 위한 스냅샷 배열
  interface CartLine {
    key: string;
    type: UsageType;
    name: string;
    priceWon: number;
    discountWon: number;
    mileageEarn: number;
    mileageUse: number;
    attendanceMileageEarn: number;
    mileageUsable: boolean;
    vatIncluded: boolean;
    startDate: string;
    durationDays: number;
    lockerId?: number;
    lockerLabel?: string;
    lockerPassword?: string;
    paymentMethod: "cash" | "card" | "transfer" | "etc";
    paymentCustom?: string;
    sellerId: number;
    memo: string;
    // 묶음 구성 상품 — 이 라인 발급 시 함께 발급될 상품들
    components?: BundleComp[];
  }
  const [cart, setCart] = useState<CartLine[]>([]);
  // 현재 폼에 선택된 상품의 묶음 구성 (담기/결제 시 라인에 실려 함께 발급)
  const [pickedComponents, setPickedComponents] = useState<BundleComp[]>([]);
  // 목록에서 선택한 상품 id (선택 여부 시각 표시용)
  const [pickedProductId, setPickedProductId] = useState<number | null>(null);
  // 라인 합계 = (상품 순금액) + (구성 상품 가격 합)
  const lineTotal = (c: CartLine) =>
    Math.max(0, c.priceWon - c.discountWon) +
    (c.components ?? []).reduce((s, k) => s + Math.max(0, Math.floor(k.price_won ?? 0)), 0);
  const cartTotalPrice = cart.reduce((s, c) => s + lineTotal(c), 0);
  const cartTotalMileageEarn = cart.reduce((s, c) => s + c.mileageEarn, 0);

  // 결제 단위 "보유 마일리지 사용": 체크 시 회원 보유 마일리지를 총액 한도 내에서 적용해 결제액 차감.
  // 미체크 시 원래 금액 그대로. 적용 마일리지는 결제 시 회원 잔고에서 차감되고 회원 로그에 남는다.
  const [useOwnedMileage, setUseOwnedMileage] = useState(false);
  // 사용할 마일리지 직접 입력값 (체크 시 노출). 체크 켤 때 최대치로 프리필, 이후 사용자가 조정.
  const [mileageUseInput, setMileageUseInput] = useState(0);
  const ownedMileage = Math.max(0, memberMileage);
  // 장바구니가 있으면 장바구니 합계, 없으면 현재 폼 항목(바로 결제) 순금액 + 묶음 구성 가격 합.
  const formNetPrice = name.trim()
    ? Math.max(0, priceWon - discountWon) +
      pickedComponents.reduce((s, k) => s + Math.max(0, Math.floor(k.price_won ?? 0)), 0)
    : 0;
  const checkoutTotal = cart.length > 0 ? cartTotalPrice : formNetPrice;
  // 적용 가능한 최대 마일리지 = 보유량과 결제 총액 중 작은 값.
  const maxApplicableMileage = Math.min(ownedMileage, checkoutTotal);
  const appliedOwnedMileage = useOwnedMileage
    ? Math.min(Math.max(0, Math.floor(mileageUseInput) || 0), maxApplicableMileage)
    : 0;
  const finalPayAmount = Math.max(0, checkoutTotal - appliedOwnedMileage);

  // 결제 성공 직후: 전자계약서 작성 여부 묻는 다이얼로그
  const [contractPromptOpen, setContractPromptOpen] = useState(false);
  const [contractPickerOpen, setContractPickerOpen] = useState(false);
  interface ContractTpl {
    id: number;
    category: string;
    title: string;
  }
  const [contractTemplates, setContractTemplates] = useState<ContractTpl[]>([]);
  const [contractTplLoading, setContractTplLoading] = useState(false);

  const resetFormOnly = () => {
    setName("");
    setPriceWon(0);
    setDiscountWon(0);
    setMileageEarn(0);
    setMileageUsable(true);
    setMileageUse(0);
    setStartDate("");
    setDurationDays(0);
    setMemo("");
    setLockerZone("");
    setLockerId("");
    setLockerPassword("");
    setPickedComponents([]);
    setPickedProductId(null);
    setError("");
  };

  const addToCart = (): string | null => {
    if (!name.trim()) {
      return type === "membership"
        ? "회원권 상품을 선택하거나 입력해 주세요"
        : type === "locker"
          ? "락커 상품을 선택하거나 입력해 주세요"
          : "대여 상품을 선택하거나 입력해 주세요";
    }
    // 락커는 배정(구역/자리)을 결제 후로 미룰 수 있음 → 필수 아님.
    if (!startDate) return "시작일을 선택해 주세요";
    if (!durationDays || durationDays < 1) return "이용 기간을 입력해 주세요";
    if (!expiresAt) return "기간을 확인해 주세요";
    if (!sellerId) return "판매자를 선택해 주세요";
    const loc = type === "locker" && lockerId
      ? lockers.find((l) => l.id === lockerId)
      : null;
    const line: CartLine = {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: name.trim(),
      priceWon,
      discountWon,
      mileageEarn,
      mileageUse,
      attendanceMileageEarn,
      mileageUsable,
      vatIncluded,
      startDate,
      durationDays,
      lockerId: type === "locker" && lockerId ? Number(lockerId) : undefined,
      lockerLabel: loc ? `${loc.zone_name} ${loc.number}번` : undefined,
      lockerPassword: type === "locker" ? lockerPassword : undefined,
      paymentMethod,
      paymentCustom: paymentMethod === "etc" ? paymentCustom : undefined,
      sellerId: Number(sellerId),
      memo,
      components: pickedComponents.length ? pickedComponents : undefined,
    };
    setCart((cur) => [...cur, line]);
    resetFormOnly();
    return null;
  };

  const expiresAt = (() => {
    if (!startDate) return "";
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Math.max(1, durationDays));
    return d.toISOString().slice(0, 10);
  })();

  // 초기화
  useEffect(() => {
    if (open) {
      setType("membership");
      setName("");
      setPriceWon(0);
      setDiscountWon(0);
      setMileageEarn(0);
      setMileageUsable(true);
      setMileageUse(0);
      setVatIncluded(true);
      setPaymentMethod("card");
      setPaymentCustom("");
      // 상품 선택 전엔 비어 있게 (applyProduct 가 채움)
      setStartDate("");
      setDurationDays(0);
      setMemo("");
      setLockerZone("");
      setLockerId("");
      setLockerPassword("");
      setCart([]);
      setError("");
    }
  }, [open]);

  // 판매자 기본값 = 로그인 직원(본인). 없으면 목록 첫 직원
  useEffect(() => {
    if (open && staffList.length > 0 && sellerId === "") {
      const mine = myMemberId && staffList.some((s) => s.id === myMemberId) ? myMemberId : staffList[0].id;
      setSellerId(mine);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffList, myMemberId]);

  // 타입별 상품 카탈로그 로드 (프리필용)
  //   + 유형이 바뀌면 왼쪽 폼을 초기화(이전 유형의 상품/기간/금액 잔재 제거).
  //     장바구니(cart)/공통 결제 정보(sellerId, paymentMethod)는 그대로 유지.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPriceWon(0);
    setDiscountWon(0);
    setMileageEarn(0);
    setMileageUsable(true);
    setMileageUse(0);
    setStartDate("");
    setDurationDays(0);
    setMemo("");
    setLockerZone("");
    setLockerId("");
    setLockerPassword("");
    setPickedComponents([]);
    setPickedProductId(null);
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const productType = type === "apparel" ? "apparel" : type; // membership | locker | apparel
      const res = await fetch(`/api/crm/products?type=${productType}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products ?? []);
      }
      if (type === "locker") {
        const [lr, mr] = await Promise.all([
          fetch("/api/crm/lockers/vacant", {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          // 회수 전 기존 락커 조회(만료여도 state='assigned' 라 vacant 에는 안 잡힘)
          fetch(`/api/crm/lockers/of-member?member_id=${memberId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ]);
        const vacant: VacantLocker[] = lr.ok ? (await lr.json()).lockers ?? [] : [];
        const mine = mr.ok ? (await mr.json()).lockers ?? [] : [];
        const held = mine[0]
          ? {
              id: mine[0].id,
              zone_id: mine[0].zone_id,
              zone_name: mine[0].zone_name,
              number: mine[0].number,
              password: mine[0].password ?? null,
            }
          : null;
        setExistingLocker(held);
        if (held) {
          // 기존 자리를 선택지에 포함(빈 자리 목록엔 없으므로 주입) + 자동 이어서 배정 + 비밀번호 유지
          setLockers([
            { id: held.id, zone_id: held.zone_id, zone_name: held.zone_name, number: held.number },
            ...vacant.filter((v) => v.id !== held.id),
          ]);
          setLockerZone(held.zone_id);
          setLockerId(held.id);
          setLockerPassword(held.password ?? "");
        } else {
          setLockers(vacant);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);

  // 같은 종류의 유효한 이용권이 이미 있으면 그 만료 다음날부터 이어서 시작(없으면 오늘).
  const fetchChainedStart = async (t: UsageType): Promise<string> => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const token = await getIdToken();
      if (!token) return today;
      const res = await fetch(`/api/crm/members/${memberId}/next-start?type=${t}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const d = await res.json();
        return (d.start_date as string) || today;
      }
    } catch {
      /* ignore */
    }
    return today;
  };

  const applyProduct = (p: UsageProduct) => {
    setName(p.name);
    setPriceWon(p.price_won ?? 0);
    setMileageEarn(p.mileage_earn ?? 0);
    setMileageUsable(p.mileage_usable !== false);
    setAttendanceMileageEarn(p.attendance_mileage_earn ?? 0);
    setPickedComponents(p.components ?? []);
    setPickedProductId(p.id);
    if (p.mileage_usable === false) setMileageUse(0);
    // 시작일: 기존 같은 종류 이용권이 있으면 만료 다음날, 없으면 오늘 (사용자가 이후 수정 가능)
    setStartDate(new Date().toISOString().slice(0, 10)); // 즉시 fallback
    fetchChainedStart(type).then(setStartDate);
    if (p.duration_value && p.duration_unit) {
      // 12개월 = 365일이 되도록 unitToDays 공통 헬퍼 사용
      setDurationDays(Math.max(1, unitToDays(p.duration_value, p.duration_unit)));
    } else {
      // 기간 미설정 상품은 기본 30일로
      setDurationDays(30);
    }
  };

  // 단일 CartLine 을 서버에 발급.
  const postLine = async (
    line: CartLine,
    headers: { authorization: string; "content-type": string }
  ): Promise<{ ok: boolean; error?: string }> => {
    const lineExpires = (() => {
      if (!line.startDate) return "";
      const d = new Date(`${line.startDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Math.max(1, line.durationDays));
      return d.toISOString().slice(0, 10);
    })();
    try {
      let res: Response;
      // 서버 스키마상 price_won = 실결제(할인 후) 로 저장돼야 함.
      // detail 팝업이 '정가 = price_won + discount_won' 로 역산하므로,
      // 클라이언트에서 net(=정가-할인) 을 계산해 price_won 으로 보낸다.
      const linePriceNet = Math.max(0, (line.priceWon ?? 0) - (line.discountWon ?? 0));
      if (line.type === "membership") {
        res = await fetch("/api/crm/memberships", {
          method: "POST",
          headers,
          body: JSON.stringify({
            member_id: memberId,
            seller_member_id: line.sellerId,
            plan_name: line.name,
            duration_days: line.durationDays,
            price_won: linePriceNet,
            discount_won: line.discountWon,
            mileage_earned: line.mileageEarn,
            mileage_used: line.mileageUse,
            attendance_mileage_earn: line.attendanceMileageEarn,
            vat_included: line.vatIncluded,
            payment_method: line.paymentMethod,
            payment_method_custom: line.paymentCustom,
            start_date: line.startDate,
            expires_at: lineExpires,
            memo: line.memo || undefined,
          }),
        });
      } else if (line.type === "apparel") {
        res = await fetch("/api/crm/rentals", {
          method: "POST",
          headers,
          body: JSON.stringify({
            member_id: memberId,
            seller_member_id: line.sellerId,
            item_name: line.name,
            price_won: linePriceNet,
            discount_won: line.discountWon,
            mileage_earned: line.mileageEarn,
            mileage_used: line.mileageUse,
            vat_included: line.vatIncluded,
            payment_method: line.paymentMethod,
            payment_method_custom: line.paymentCustom,
            start_date: line.startDate,
            expires_at: lineExpires,
            memo: line.memo || undefined,
          }),
        });
      } else {
        // locker: 자리(lockerId) 가 지정된 경우에만 물리 배정.
        //   지정 안 됐으면 결제(rental 매출)만 기록 → 배정은 나중에 락커 관리에서 진행.
        if (line.lockerId) {
          const assignRes = await fetch(`/api/crm/lockers/${line.lockerId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              action: "assign",
              member_id: memberId,
              start_date: line.startDate,
              expires_at: lineExpires,
              password: line.lockerPassword || undefined,
              memo: line.memo || undefined,
            }),
          });
          const aData = await assignRes.json();
          if (!assignRes.ok) return { ok: false, error: aData?.error || "락커 배정 실패" };
        }

        const rentalMemo = [
          line.lockerLabel ?? "구역 미배정",
          line.memo,
        ]
          .filter(Boolean)
          .join(" · ");

        res = await fetch("/api/crm/rentals", {
          method: "POST",
          headers,
          body: JSON.stringify({
            member_id: memberId,
            seller_member_id: line.sellerId,
            item_name: line.name,
            price_won: linePriceNet,
            discount_won: line.discountWon,
            mileage_earned: line.mileageEarn,
            mileage_used: line.mileageUse,
            vat_included: line.vatIncluded,
            payment_method: line.paymentMethod,
            payment_method_custom: line.paymentCustom,
            start_date: line.startDate,
            expires_at: lineExpires,
            memo: rentalMemo,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data?.error || "발급 실패" };

      // 묶음 구성 상품 함께 발급 (판매 시 부모 + 구성 항목 동시 생성)
      if (line.components && line.components.length > 0) {
        const token = headers.authorization.replace(/^Bearer\s+/, "");
        for (const comp of line.components) {
          const r = await postBundleComponent(comp, {
            memberId,
            sellerId: line.sellerId,
            trainerId: line.sellerId,
            startDate: line.startDate,
            paymentMethod: line.paymentMethod,
            paymentCustom: line.paymentCustom,
            token,
          });
          if (!r.ok) return { ok: false, error: `[구성] ${r.error}` };
        }
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "네트워크 오류" };
    }
  };

  const submit = async () => {
    setError("");
    // 장바구니에 아무것도 없고 현재 폼에 상품이 입력돼 있으면 자동으로 담고 결제.
    let toProcess: CartLine[] = cart;
    if (toProcess.length === 0) {
      const err = addToCart();
      if (err) return setError(err);
      // addToCart 는 setCart 를 호출하므로 다음 렌더에서만 반영됨.
      // 즉시 처리 위해 로컬로 다시 만든다.
      const loc = type === "locker" ? lockers.find((l) => l.id === lockerId) : null;
      toProcess = [
        {
          key: `now-${Date.now()}`,
          type,
          name: name.trim(),
          priceWon,
          discountWon,
          mileageEarn,
          mileageUse,
          attendanceMileageEarn,
          mileageUsable,
          vatIncluded,
          startDate,
          durationDays,
          lockerId: type === "locker" ? (lockerId as number) : undefined,
          lockerLabel: loc ? `${loc.zone_name} ${loc.number}번` : undefined,
          lockerPassword: type === "locker" ? lockerPassword : undefined,
          paymentMethod,
          paymentCustom: paymentMethod === "etc" ? paymentCustom : undefined,
          sellerId: Number(sellerId),
          memo,
          components: pickedComponents.length ? pickedComponents : undefined,
        },
      ];
    }

    // 보유 마일리지 사용: 총액 한도 내 적용액을 각 라인에 순서대로 배분(mileage_used).
    // 서버가 라인 발급 시 회원 잔고에서 차감하고 발급 이력(회원 로그)에 기록한다.
    if (useOwnedMileage && appliedOwnedMileage > 0) {
      let remaining = appliedOwnedMileage;
      toProcess = toProcess.map((line) => {
        if (remaining <= 0) return line;
        const net = Math.max(0, line.priceWon - line.discountWon);
        const alloc = Math.min(remaining, net);
        remaining -= alloc;
        return { ...line, mileageUse: line.mileageUse + alloc };
      });
    }

    setSubmitting(true);
    try {
      const token = await getIdToken();
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };
      const failed: string[] = [];
      for (const line of toProcess) {
        const r = await postLine(line, headers);
        if (!r.ok) failed.push(`${line.name}: ${r.error}`);
      }
      if (failed.length > 0) throw new Error(failed.join(" · "));
      // 결제 성공 → 전자계약서 작성 여부 다이얼로그
      setContractPromptOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const loadContractTemplates = async () => {
    setContractTplLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/contracts", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setContractTemplates((data.contracts ?? []) as ContractTpl[]);
      }
    } finally {
      setContractTplLoading(false);
    }
  };

  const openContractPicker = async () => {
    setContractPromptOpen(false);
    setContractPickerOpen(true);
    if (contractTemplates.length === 0) await loadContractTemplates();
  };

  const goToContractSign = (tplId: number) => {
    setContractPickerOpen(false);
    // 결제 확정된 상품 정보를 후처리 페이지에서 채우기 어려우므로,
    // 회원 + 템플릿 만으로 sign/new 로 이동 (계약서 폼에서 나머지 상세 편집)
    if (typeof window !== "undefined") {
      window.location.href = `/crm/contracts/sign/new?member_id=${memberId}&template_id=${tplId}`;
    }
  };

  const finishWithoutContract = () => {
    setContractPromptOpen(false);
    setContractPickerOpen(false);
    onSuccess();
  };

  return (
    <CrmModal open={open} onClose={onClose} title="회원권 발급" size="xl">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-3">
        <CrmField label="종류" required>
          <div className="grid grid-cols-3 gap-2">
            {USAGE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`px-2 py-2 rounded-lg text-[13px] font-medium
                  ${type === t.key
                    ? "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CrmField>

        {/* 상품 검색 (모든 탭 공통) */}
        <CrmField
          label={type === "membership" ? "회원권 상품" : type === "locker" ? "락커 상품" : "대여 상품"}
          required
        >
          <div className="relative">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowProducts(true);
                setPickedProductId(null);
              }}
              onFocus={() => setShowProducts(true)}
              onBlur={() => setTimeout(() => setShowProducts(false), 150)}
              placeholder="상품 관리에 등록된 상품명 검색 (직접 입력 가능)"
              autoComplete="off"
              className={`${crmInputClass} ${pickedProductId ? "border-[#6B7B3A] bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/15 font-semibold" : ""}`}
            />
            {showProducts &&
              (() => {
                const q = name.trim().toLowerCase();
                const matches = products
                  .filter((p) => !q || p.name.toLowerCase().includes(q))
                  .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                  .slice(0, 50);
                if (matches.length === 0) return null;
                return (
                  <ul className="absolute z-20 left-0 right-0 mt-1 max-h-[360px] overflow-y-auto rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyProduct(p);
                            setShowProducts(false);
                          }}
                          className={`w-full text-left px-3 py-2 border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0 ${
                            pickedProductId === p.id
                              ? "bg-[#6B7B3A]/12 dark:bg-[#6B7B3A]/25"
                              : "hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                          }`}
                        >
                          <div className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100 flex items-center gap-1.5">
                            {pickedProductId === p.id && <span className="text-[#6B7B3A]">✓</span>}
                            {p.name}
                          </div>
                          <div className="text-[11px] text-[#8C8270]">
                            {p.price_won ? `${formatWon(p.price_won)}원` : "금액 미정"}
                            {p.mileage_earn > 0 && ` · 적립 ${p.mileage_earn.toLocaleString()}P`}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
          </div>
          {products.length === 0 && (
            <p className="mt-1 text-[11px] text-[#A89B80]">
              등록된 {type === "membership" ? "회원권" : type === "locker" ? "락커" : "대여"} 상품이
              없어요. 직접 입력하거나 상품 관리에서 추가해 주세요.
            </p>
          )}
        </CrmField>

        {/* 락커: 구역 → 빈 자리 → 비밀번호 */}
        {type === "locker" && (
          <>
            {lockers.length === 0 ? (
              <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 text-[12.5px] text-[#8C8270]">
                비어있는 락커가 없어요. 락커 관리에서 확인해 주세요.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <CrmField label="구역">
                  <select
                    className={crmInputClass}
                    value={lockerZone}
                    onChange={(e) => {
                      setLockerZone(e.target.value ? Number(e.target.value) : "");
                      setLockerId("");
                    }}
                  >
                    <option value="">배정 없이 결제</option>
                    {Array.from(
                      new Map(lockers.map((l) => [l.zone_id, l.zone_name])).entries()
                    ).map(([zid, zname]) => (
                      <option key={zid} value={zid}>
                        {zname} ({lockers.filter((l) => l.zone_id === zid).length}자리)
                      </option>
                    ))}
                  </select>
                </CrmField>
                <CrmField label="빈 자리">
                  <select
                    className={crmInputClass}
                    value={lockerId}
                    disabled={lockerZone === ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : "";
                      setLockerId(id);
                      if (!id) return;
                      const carried = existingLocker ? existingLocker.password ?? "" : "";
                      if (existingLocker && id === existingLocker.id) {
                        // 회수 전 기존 자리 이어서 → 기존 비밀번호 유지
                        setLockerPassword(existingLocker.password ?? "");
                      } else if (!lockerPassword || lockerPassword === carried) {
                        // 새(빈) 자리 → 자동 생성(직접 입력값은 유지)
                        setLockerPassword(genLockerPassword());
                      }
                    }}
                  >
                    <option value="">
                      {lockerZone === "" ? "배정 나중에" : "자리 선택"}
                    </option>
                    {lockers
                      .filter((l) => l.zone_id === lockerZone)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.number}번{existingLocker && l.id === existingLocker.id ? " (기존·이어서)" : ""}
                        </option>
                      ))}
                  </select>
                </CrmField>
              </div>
            )}
            {existingLocker ? (
              <p className="text-[11.5px] text-[#8B6BB1] dark:text-purple-300 -mt-1">
                회수 전 <strong>{existingLocker.zone_name} {existingLocker.number}번</strong> 락커가 있어 이어서 배정됩니다(비밀번호 유지). 새 자리를 원하면 변경하세요.
              </p>
            ) : (
              <p className="text-[11.5px] text-[#A89B80] -mt-1">
                구역·자리를 지금 지정하지 않으면 결제만 먼저 진행하고, 나중에 <strong>락커 관리</strong> 에서 배정할 수 있어요.
              </p>
            )}
            <CrmField label="락커 비밀번호">
              <div className="flex gap-1.5">
                <input
                  className={crmInputClass}
                  value={lockerPassword}
                  onChange={(e) => setLockerPassword(e.target.value)}
                  placeholder="자리 선택 시 자동 생성"
                />
                <button
                  type="button"
                  onClick={() => setLockerPassword(genLockerPassword())}
                  className="shrink-0 px-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-300 hover:border-[#8B6BB1]/50"
                >
                  재생성
                </button>
              </div>
            </CrmField>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <CrmField label="시작일" required>
            <input
              type="date"
              className={crmInputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="상품 선택 후 자동 입력"
            />
          </CrmField>
          <CrmField label="이용 기간(일)" required>
            <input
              type="number"
              min={1}
              className={crmInputClass}
              value={durationDays > 0 ? durationDays : ""}
              onChange={(e) =>
                setDurationDays(Math.max(0, Number(e.target.value) || 0))
              }
              placeholder="상품 선택 후 자동 입력"
            />
          </CrmField>
        </div>
        <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 -mt-1">
          만료일: <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{expiresAt || "—"}</strong>
        </div>

        <CrmField label="판매자" required>
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

        <div className="grid grid-cols-2 gap-2">
          <CrmField label={type === "locker" ? "대여료 (원)" : "정가 (원)"}>
            <input
              type="text"
              inputMode="numeric"
              className={crmInputClass}
              value={priceWon ? formatWon(priceWon) : ""}
              onChange={(e) => setPriceWon(parseWon(e.target.value))}
              placeholder="0"
            />
          </CrmField>
          <CrmField label="할인 금액 (원)">
            <input
              type="text"
              inputMode="numeric"
              className={crmInputClass}
              value={discountWon ? formatWon(discountWon) : ""}
              onChange={(e) => setDiscountWon(parseWon(e.target.value))}
              placeholder="0"
            />
          </CrmField>
        </div>
        <label className="flex items-center gap-2 cursor-pointer -mt-1">
          <input
            type="checkbox"
            checked={vatIncluded}
            onChange={(e) => {
              const checked = e.target.checked;
              setVatIncluded(checked);
              // 부가세 포함↔별도 토글 시 표시 금액을 환산(체크 해제=÷1.1, 재체크=×1.1).
              // 예) 550,000(포함) → 해제 → 500,000. 이후 수동 변경은 자유.
              setPriceWon((prev) => (prev ? Math.round(checked ? prev * 1.1 : prev / 1.1) : prev));
            }}
            className="w-4 h-4 accent-[#6B7B3A]"
          />
          <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">부가세 포함 금액</span>
        </label>
        {discountWon > 0 && (
          <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 -mt-1">
            정가 {formatWon(priceWon)}원 · 할인 {formatWon(discountWon)}원 → 실결제{" "}
            <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">
              {formatWon(Math.max(0, priceWon - discountWon))}원
            </strong>
          </div>
        )}

        {/* 마일리지 */}
        {(
          <div className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-900/40 space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#6B5D47] dark:text-zinc-400">
                적립 예정 <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{mileageEarn.toLocaleString()}P</strong>
              </span>
              <span className="text-[#A89B80]">보유 {memberMileage.toLocaleString()}P</span>
            </div>
            {mileageUsable && memberMileage > 0 && (
              <div>
                <label className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400">마일리지 사용 (P)</label>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${crmInputClass} flex-1`}
                    value={mileageUse ? mileageUse.toLocaleString() : ""}
                    onChange={(e) =>
                      setMileageUse(
                        Math.max(
                          0,
                          Math.min(
                            memberMileage,
                            Number(e.target.value.replace(/[^\d]/g, "")) || 0
                          )
                        )
                      )
                    }
                    placeholder="0"
                  />
                  <button
                    type="button"
                    onClick={() => setMileageUse(memberMileage)}
                    className="px-2.5 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap hover:bg-[#F5F0E5]"
                  >
                    전액
                  </button>
                </div>
                {mileageUse > 0 && (
                  <div className="mt-1 text-[11px] text-[#8C8270]">
                    사용 후 잔여 {(memberMileage - mileageUse + mileageEarn).toLocaleString()}P (적립 반영)
                  </div>
                )}
              </div>
            )}
            {!mileageUsable && (
              <div className="text-[11px] text-[#A89B80]">이 상품은 마일리지 사용이 제한되어 있어요.</div>
            )}
          </div>
        )}

        <CrmField label="결제 수단">
          <div className="grid grid-cols-4 gap-1.5">
            {(["card", "cash", "transfer", "etc"] as const).map((mth) => (
              <button
                key={mth}
                onClick={() => setPaymentMethod(mth)}
                className={`px-2 py-2 rounded-lg text-[12px] font-medium
                  ${paymentMethod === mth
                    ? "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {PAYMENT_METHOD_LABEL[mth]}
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

        <CrmField label="메모">
          <textarea
            className={`${crmInputClass} min-h-[56px]`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {pickedComponents.length > 0 && (
          <div className="mt-2 px-3 py-2.5 rounded-lg border border-[#B47B2A]/40 bg-[#B47B2A]/5">
            <div className="text-[12px] font-semibold text-[#B47B2A] mb-1">🎁 묶음 구성 (함께 발급)</div>
            <ul className="space-y-0.5">
              {pickedComponents.map((c, i) => (
                <li key={i} className="flex items-baseline justify-between text-[12px] text-[#6B5D47] dark:text-zinc-400">
                  <span className="truncate">+ {c.name || "구성 상품"} {c.billing_mode === "count" ? `${c.total_sessions ?? 0}회` : `${c.duration_value ?? 0}일`}</span>
                  <span className="tabular-nums shrink-0 ml-2">{formatWon(c.price_won ?? 0)}원</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={() => {
            const err = addToCart();
            if (err) setError(err);
            else setError("");
          }}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] mt-2"
        >
          장바구니에 담기
        </button>
        </div>

        {/* 우측: 장바구니 + 총액 + 결제하기 */}
        <aside className="md:sticky md:top-0 md:self-start space-y-3">
          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                장바구니
              </span>
              <span className="text-[11.5px] text-[#A89B80]">{cart.length}건</span>
            </div>
            {cart.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#A89B80]">
                왼쪽에서 상품을 담아주세요
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {cart.map((c, i) => {
                  const typeLbl =
                    c.type === "membership" ? "회원권" : c.type === "locker" ? "락커" : "운동복";
                  const net = Math.max(0, c.priceWon - c.discountWon);
                  return (
                    <li
                      key={c.key}
                      className="rounded-lg border border-[#E8E0D0]/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-2 text-[12.5px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]">
                              {typeLbl}
                            </span>
                            {c.lockerLabel && (
                              <span className="text-[10.5px] text-[#8C8270]">{c.lockerLabel}</span>
                            )}
                          </div>
                          <div className="mt-1 font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                            {c.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#8C8270]">
                            {c.startDate} · {c.durationDays}일
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((cur) => cur.filter((_, idx) => idx !== i))
                          }
                          className="text-[11px] text-red-600 hover:underline shrink-0"
                        >
                          제거
                        </button>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-[10.5px] text-[#A89B80]">
                          {c.discountWon > 0
                            ? `${formatWon(c.priceWon + c.discountWon)}원 - ${formatWon(c.discountWon)}원`
                            : ""}
                        </span>
                        <span className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100 tabular-nums">
                          {formatWon(net)}원
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border-2 border-[#6B7B3A]/40 bg-[#6B7B3A]/5 p-3 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
                {appliedOwnedMileage > 0 ? "총 상품 금액" : "총 결제 금액"}
              </span>
              <span
                className={`tabular-nums ${
                  appliedOwnedMileage > 0
                    ? "text-[14px] font-semibold text-[#6B5D47] dark:text-zinc-300"
                    : "text-[18px] font-extrabold text-[#3A342A] dark:text-zinc-100"
                }`}
              >
                {formatWon(checkoutTotal)}원
              </span>
            </div>
            {appliedOwnedMileage > 0 && (
              <div className="flex items-baseline justify-between text-[12px] text-[#B47B2A] font-medium">
                <span>마일리지 사용</span>
                <span className="tabular-nums">-{appliedOwnedMileage.toLocaleString()}P</span>
              </div>
            )}
            {cartTotalMileageEarn > 0 && (
              <div className="flex items-baseline justify-between text-[11px] text-[#6B7B3A]">
                <span>적립 예정</span>
                <span>+{cartTotalMileageEarn.toLocaleString()}P</span>
              </div>
            )}
            {appliedOwnedMileage > 0 && (
              <div className="flex items-baseline justify-between pt-1.5 mt-1 border-t border-[#6B7B3A]/25">
                <span className="text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300">최종 결제 금액</span>
                <span className="text-[18px] font-extrabold text-[#3A342A] dark:text-zinc-100 tabular-nums">
                  {formatWon(finalPayAmount)}원
                </span>
              </div>
            )}
          </div>

          {/* 보유 마일리지 사용 — 체크 시 사용할 마일리지를 직접 입력 */}
          <div
            className={`rounded-lg border ${
              useOwnedMileage
                ? "border-[#B47B2A] bg-[#B47B2A]/5"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900"
            } ${ownedMileage <= 0 || checkoutTotal <= 0 ? "opacity-50" : ""}`}
          >
            <label
              className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                ownedMileage <= 0 || checkoutTotal <= 0 ? "cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <span className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  보유 마일리지 사용
                </span>
                <span className="text-[11px] text-[#A89B80]">
                  보유 {ownedMileage.toLocaleString()}P
                  {maxApplicableMileage > 0 && ` · 최대 ${maxApplicableMileage.toLocaleString()}P 사용 가능`}
                </span>
              </span>
              <input
                type="checkbox"
                checked={useOwnedMileage}
                disabled={ownedMileage <= 0 || checkoutTotal <= 0}
                onChange={(e) => {
                  const on = e.target.checked;
                  setUseOwnedMileage(on);
                  // 체크 켤 때 최대치로 프리필(이후 사용자가 조정), 끄면 0.
                  setMileageUseInput(on ? maxApplicableMileage : 0);
                }}
                className="w-5 h-5 accent-[#B47B2A] shrink-0 disabled:opacity-40"
              />
            </label>
            {useOwnedMileage && (
              <div className="px-3 pb-3 -mt-0.5">
                <div className="flex items-stretch gap-2">
                  <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950">
                    <input
                      type="number"
                      min={0}
                      max={maxApplicableMileage}
                      value={mileageUseInput === 0 ? "" : mileageUseInput}
                      placeholder="0"
                      onChange={(e) => {
                        const v = Math.floor(Number(e.target.value) || 0);
                        setMileageUseInput(Math.max(0, Math.min(v, maxApplicableMileage)));
                      }}
                      className="flex-1 min-w-0 bg-transparent text-right text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tabular-nums focus:outline-none"
                    />
                    <span className="text-[13px] font-semibold text-[#8C8270] shrink-0">P</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMileageUseInput(maxApplicableMileage)}
                    className="px-3 rounded-lg border border-[#B47B2A] text-[#B47B2A] text-[12.5px] font-semibold hover:bg-[#B47B2A]/10 shrink-0"
                  >
                    전액
                  </button>
                </div>
                {mileageUseInput > maxApplicableMileage && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    최대 {maxApplicableMileage.toLocaleString()}P 까지 사용할 수 있어요.
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={submitting || (cart.length === 0 && !name.trim())}
            className="w-full px-4 py-3 rounded-lg bg-[#B47B2A] disabled:opacity-60 text-white text-[14.5px] font-bold hover:bg-[#9c682a]"
          >
            {submitting
              ? "결제 중…"
              : cart.length === 0
                ? `${appliedOwnedMileage > 0 ? `${formatWon(finalPayAmount)}원 ` : "폼 항목 "}결제하기`
                : `${cart.length}건 ${appliedOwnedMileage > 0 ? `· ${formatWon(finalPayAmount)}원 ` : ""}결제하기`}
          </button>
          <p className="text-[10.5px] text-[#A89B80] leading-relaxed">
            &lsquo;장바구니에 담기&rsquo; 로 여러 상품을 추가한 뒤 한 번에 결제하세요. 담긴 상품이 없으면 왼쪽 폼의 항목을 바로 결제합니다.
          </p>
        </aside>
      </div>

      {/* 결제 성공 → 전자계약서 여부 다이얼로그 */}
      {contractPromptOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={finishWithoutContract} />
          <div className="relative w-full max-w-sm rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl p-5">
            <h3 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">결제 완료</h3>
            <p className="mt-1.5 text-[13px] text-[#6B5D47] dark:text-zinc-400">
              지금 회원과 함께 있는 자리라면 전자 계약서를 바로 작성하시겠어요?
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={openContractPicker}
                className="w-full px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
              >
                전자 계약서 작성하기
              </button>
              <button
                type="button"
                onClick={finishWithoutContract}
                className="w-full px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
              >
                미작성하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 전자계약서 선택 다이얼로그 */}
      {contractPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setContractPickerOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E0D0]/70 dark:border-zinc-800">
              <h3 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">
                전자 계약서 선택
              </h3>
              <button
                onClick={() => setContractPickerOpen(false)}
                className="p-1 -m-1 text-[#A89B80] hover:text-[#3A342A]"
                aria-label="닫기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {contractTplLoading ? (
                <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
              ) : contractTemplates.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-[13px] text-[#8C8270]">등록된 계약서 템플릿이 없어요.</div>
                  <a
                    href="/crm/settings?tab=contracts"
                    className="mt-2 inline-block text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
                  >
                    계약서 관리로 이동 →
                  </a>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {contractTemplates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => goToContractSign(t.id)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-[#6B7B3A]/40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                      >
                        <div className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                          {t.title}
                        </div>
                        <div className="text-[11.5px] text-[#8C8270] mt-0.5">
                          유형 · {t.category}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
              <button
                type="button"
                onClick={finishWithoutContract}
                className="flex-1 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-medium text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]"
              >
                작성하지 않고 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </CrmModal>
  );
}

function PassIssueModal({
  open,
  onClose,
  memberId,
  staffList,
  myMemberId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  memberId: number;
  staffList: { id: number; display_name: string; role: string; status: string }[];
  myMemberId?: number | null;
  onSuccess: (passId: number) => void;
}) {
  const { getIdToken } = useAuth();
  const [issueType, setIssueType] = useState<"new" | "renewal" | "trial" | "service">("new");
  const [lessonKind, setLessonKind] = useState("");
  const [lessonKinds, setLessonKinds] = useState<{ id: number; label: string }[]>([]);
  const [passProducts, setPassProducts] = useState<PassProduct[]>([]);
  const [pickedProductId, setPickedProductId] = useState<number | null>(null);
  // 선택한 수강권 상품의 묶음 구성 (예: 회원권) — 발급 성공 후 함께 발급
  const [pickedComponents, setPickedComponents] = useState<BundleComp[]>([]);
  const [showKindList, setShowKindList] = useState(false);
  const [totalSessions, setTotalSessions] = useState(10);
  const [serviceSessions, setServiceSessions] = useState(0);
  const [showServiceSessions, setShowServiceSessions] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(50);
  const [priceWon, setPriceWon] = useState(0);
  const [discountWon, setDiscountWon] = useState(0);
  const [vatIncluded, setVatIncluded] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "etc">("card");
  const [paymentCustom, setPaymentCustom] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationDays, setDurationDays] = useState(40);
  const [unlimited, setUnlimited] = useState(false);
  const expiresAt = (() => {
    if (unlimited) return "9999-12-31";
    if (!startDate) return "";
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Math.max(0, durationDays));
    return d.toISOString().slice(0, 10);
  })();
  const [memo, setMemo] = useState("");
  const [trainerId, setTrainerId] = useState<number | "">("");
  const [coTrainerIds, setCoTrainerIds] = useState<number[]>([]);
  const [sellerId, setSellerId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 첫 직원을 기본 강사로, 판매자 기본값은 로그인 직원(본인)
  useEffect(() => {
    if (open && staffList.length > 0) {
      if (trainerId === "") setTrainerId(staffList[0].id);
      if (sellerId === "") {
        const mine = myMemberId && staffList.some((s) => s.id === myMemberId) ? myMemberId : staffList[0].id;
        setSellerId(mine);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffList, myMemberId]);

  // 열릴 때 수업 종류 목록 + 수강권 상품(개인/그룹) 로드
  useEffect(() => {
    if (!open) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const headers = { authorization: `Bearer ${token}` };
      const res = await fetch("/api/crm/lesson-kinds", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLessonKinds(data.kinds ?? []);
      }
      const [pRes, gRes] = await Promise.all([
        fetch("/api/crm/products?type=personal", { headers, cache: "no-store" }),
        fetch("/api/crm/products?type=group", { headers, cache: "no-store" }),
      ]);
      const merged: PassProduct[] = [];
      if (pRes.ok) merged.push(...((await pRes.json()).products ?? []));
      if (gRes.ok) merged.push(...((await gRes.json()).products ?? []));
      setPassProducts(merged);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 발급 유형 기본값: 이전에 '수강권 또는 회원권' 구매 이력이 있으면 '재등록', 처음이면 '신규'.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const headers = { authorization: `Bearer ${token}` };
      const [pRes, mRes] = await Promise.all([
        fetch(`/api/crm/members/${memberId}`, { headers, cache: "no-store" }),
        fetch(`/api/crm/memberships?member_id=${memberId}`, { headers, cache: "no-store" }),
      ]);
      let hasPrior = false;
      if (pRes.ok) {
        const d = await pRes.json();
        if (Array.isArray(d.passes) && d.passes.length > 0) hasPrior = true;
      }
      if (!hasPrior && mRes.ok) {
        const d = await mRes.json();
        if (Array.isArray(d.memberships) && d.memberships.length > 0) hasPrior = true;
      }
      setIssueType(hasPrior ? "renewal" : "new");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberId]);

  // 수강권 상품 선택 → 금액·세션·기간 자동 적용
  const applyPassProduct = (p: PassProduct) => {
    setPickedProductId(p.id);
    setPickedComponents(p.components ?? []);
    setLessonKind(p.name);
    if (p.total_sessions && p.total_sessions > 0) setTotalSessions(p.total_sessions);
    if (p.session_minutes && p.session_minutes > 0) setSessionMinutes(p.session_minutes);
    setPriceWon(p.price_won ?? 0);
    setDiscountWon(0);
    if (p.service_days && p.service_days > 0) {
      setDurationDays(p.service_days);
      setUnlimited(false);
    } else if (p.duration_value && p.duration_value > 0 && p.duration_unit) {
      // 12개월 = 365일이 되도록 unitToDays 공통 헬퍼 사용
      setDurationDays(Math.max(1, unitToDays(p.duration_value, p.duration_unit)));
      setUnlimited(false);
    } else {
      // 유효기간 미설정(0) = 무기한
      setUnlimited(true);
    }
  };

  const submit = async () => {
    setError("");
    if (!lessonKind.trim()) return setError("수업 종류를 입력해주세요");
    if (!trainerId) return setError("담당 강사를 선택해주세요");
    if (totalSessions < 1) return setError("총 세션 수는 1 이상이어야 합니다");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/passes", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_id: memberId,
          trainer_member_id: Number(trainerId),
          co_trainer_ids: coTrainerIds,
          seller_member_id: Number(sellerId) || Number(trainerId),
          issue_type: issueType,
          // 본 수강권은 원래 회차만. 서비스 회차는 서버가 '서비스 수강권'으로 0원 별도 발급.
          lesson_kind: `${lessonKind}(${totalSessions}회)`,
          total_sessions: totalSessions,
          service_sessions: serviceSessions || 0,
          session_minutes: sessionMinutes,
          // price_won = 할인 적용 후 실결제가, discount_won = 할인액(기록용)
          price_won: Math.max(0, priceWon - discountWon),
          discount_won: discountWon,
          vat_included: vatIncluded,
          payment_method: paymentMethod,
          payment_method_custom: paymentMethod === "etc" ? paymentCustom : undefined,
          issued_at: issuedAt,
          start_date: startDate,
          expires_at: expiresAt,
          memo: memo || undefined,
          product_id: pickedProductId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "발급 실패");

      // 묶음 구성 상품(예: 회원권) 함께 발급
      if (pickedComponents.length > 0) {
        const seller = Number(sellerId) || Number(trainerId);
        for (const comp of pickedComponents) {
          const r = await postBundleComponent(comp, {
            memberId,
            sellerId: seller,
            trainerId: Number(trainerId),
            startDate,
            paymentMethod,
            paymentCustom: paymentMethod === "etc" ? paymentCustom : undefined,
            token: token || "",
          });
          if (!r.ok) throw new Error(`[구성] ${r.error}`);
        }
      }
      onSuccess(data.passId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="수강권 발급" size="lg">
      <div className="space-y-3">
        <CrmField label="수강권 상품" required>
          <div className="relative">
            <input
              value={lessonKind}
              onChange={(e) => {
                setLessonKind(e.target.value);
                setShowKindList(true);
                setPickedProductId(null);
                setPickedComponents([]);
              }}
              onFocus={() => setShowKindList(true)}
              onBlur={() => setTimeout(() => setShowKindList(false), 150)}
              placeholder="상품 관리에 등록된 수강권 검색 (직접 입력 가능)"
              autoComplete="off"
              className={`${crmInputClass} ${pickedProductId ? "border-[#6B7B3A] bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/15 font-semibold" : ""}`}
            />
            {showKindList &&
              (() => {
                const q = lessonKind.trim().toLowerCase();
                const prods = passProducts
                  .filter((p) => !q || p.name.toLowerCase().includes(q))
                  .sort((a, b) => a.name.localeCompare(b.name, "ko"));
                const kinds = lessonKinds
                  .filter((k) => !q || k.label.toLowerCase().includes(q))
                  .sort((a, b) => a.label.localeCompare(b.label, "ko"));
                if (prods.length === 0 && kinds.length === 0) return null;
                return (
                  <ul className="absolute z-20 left-0 right-0 mt-1 max-h-[360px] overflow-y-auto rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
                    {prods.map((p) => (
                      <li key={`p${p.id}`}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyPassProduct(p);
                            setShowKindList(false);
                          }}
                          className={`w-full text-left px-3 py-2 border-b border-[#E8E0D0]/50 dark:border-zinc-800 ${
                            pickedProductId === p.id
                              ? "bg-[#6B7B3A]/12 dark:bg-[#6B7B3A]/25"
                              : "hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                          }`}
                        >
                          <div className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100 flex items-center gap-1.5">
                            {pickedProductId === p.id && <span className="text-[#6B7B3A]">✓</span>}
                            {p.name}
                          </div>
                          <div className="text-[11px] text-[#8C8270]">
                            {p.price_won ? `${formatWon(p.price_won)}원` : "금액 미정"}
                            {p.total_sessions ? ` · ${p.total_sessions}회` : ""}
                            {p.session_minutes ? ` · ${p.session_minutes}분` : ""}
                          </div>
                        </button>
                      </li>
                    ))}
                    {kinds.map((k) => (
                      <li key={`k${k.id}`}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setLessonKind(k.label);
                            setShowKindList(false);
                            setPickedProductId(null);
                            setPickedComponents([]);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0"
                        >
                          <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">{k.label}</span>
                          <span className="ml-1.5 text-[10.5px] text-[#A89B80]">수업 종류</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
          </div>
          <p className="mt-1 text-[11px] text-[#A89B80]">
            수강권을 선택하면 금액·세션·기간이 자동 채워져요. 미선택 시 직접 입력하면 됩니다.
          </p>
        </CrmField>
        <CrmField label="담당 강사" required>
          <select
            className={crmInputClass}
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">선택해주세요</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </CrmField>
        <CoTrainerPicker
          staffList={staffList}
          primaryId={trainerId}
          value={coTrainerIds}
          onChange={setCoTrainerIds}
        />
        <CrmField label="판매자">
          <select
            className={crmInputClass}
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">선택해주세요</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[#A89B80]">
            기본은 로그인한 본인이에요. 실제로 판매한 직원이 다르면 바꿔 주세요. (담당 강사와 달라도 됩니다)
          </p>
        </CrmField>
        <CrmField label="발급 유형">
          <div className="grid grid-cols-4 gap-2">
            {(["new", "renewal", "trial", "service"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setIssueType(t)}
                className={`px-2 py-2 rounded-lg text-[12.5px] font-medium
                  ${issueType === t
                    ? "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {ISSUE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </CrmField>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="총 세션 수" required>
            <input
              type="number"
              min={1}
              className={crmInputClass}
              value={totalSessions}
              onChange={(e) => setTotalSessions(Number(e.target.value) || 0)}
            />
          </CrmField>
          <CrmField label="수업 시간 (분)" required>
            <input
              type="number"
              min={10}
              step={5}
              className={crmInputClass}
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(Number(e.target.value) || 0)}
            />
          </CrmField>
        </div>

        {!showServiceSessions ? (
          <button
            type="button"
            onClick={() => setShowServiceSessions(true)}
            className="text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline font-medium"
          >
            + 서비스 섹션 수 추가하기
          </button>
        ) : (
          <CrmField label="서비스 섹션 수">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={0}
                  className={`${crmInputClass} pr-9`}
                  value={serviceSessions}
                  onChange={(e) => setServiceSessions(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#A89B80]">
                  회
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowServiceSessions(false);
                  setServiceSessions(0);
                }}
                className="text-[12px] text-[#8C8270] hover:underline"
              >
                제거
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
              서비스 회차는 별도 &lsquo;서비스 수강권&rsquo;(0원)으로 따로 발급돼요. 담당·추가강사, 시작·만료일은 본 수강권과 동일합니다.
            </p>
          </CrmField>
        )}

        <CrmField label="결제 금액 (원)">
          <input
            type="text"
            inputMode="numeric"
            className={crmInputClass}
            value={priceWon ? formatWon(priceWon) : ""}
            onChange={(e) => setPriceWon(parseWon(e.target.value))}
            placeholder="0"
          />
          <label className="mt-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={vatIncluded}
              onChange={(e) => {
                const checked = e.target.checked;
                setVatIncluded(checked);
                // 부가세 포함↔별도 토글 시 표시 금액을 환산(체크 해제=÷1.1, 재체크=×1.1).
                // 예) 550,000(포함) → 해제 → 500,000. 이후 수동 변경은 자유.
                setPriceWon((prev) => (prev ? Math.round(checked ? prev * 1.1 : prev / 1.1) : prev));
              }}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              부가세 포함 금액
            </span>
          </label>
        </CrmField>
        <CrmField label="할인 금액 (원)">
          <input
            type="text"
            inputMode="numeric"
            className={crmInputClass}
            value={discountWon ? formatWon(discountWon) : ""}
            onChange={(e) => setDiscountWon(parseWon(e.target.value))}
            placeholder="0"
          />
        </CrmField>
        <CrmField label="결제 수단">
          <div className="grid grid-cols-4 gap-1.5">
            {(["card", "cash", "transfer", "etc"] as const).map((m) => (
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
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="발급일" required>
            <input
              type="date"
              className={crmInputClass}
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
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
        </div>

        <CrmField label="유효 기간" required>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                disabled={unlimited}
                className={`${crmInputClass} pr-9 disabled:opacity-50`}
                value={durationDays}
                onChange={(e) =>
                  setDurationDays(Math.max(0, Number(e.target.value) || 0))
                }
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#A89B80]">
                일
              </span>
            </div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
                className="w-4 h-4 accent-[#6B7B3A]"
              />
              <span className="text-[12.5px] text-[#3A342A] dark:text-zinc-300">
                무기한
              </span>
            </label>
          </div>
          <div className="mt-1.5 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
            {unlimited ? (
              <>
                만료일: <strong className="text-[#B47B2A] dark:text-amber-300">무기한</strong>
              </>
            ) : (
              <>
                만료일:{" "}
                <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">
                  {expiresAt || "—"}
                </strong>{" "}
                (시작일 {startDate || "—"} + {durationDays}일)
              </>
            )}
          </div>
        </CrmField>
        <CrmField label="메모">
          <textarea
            className={`${crmInputClass} min-h-[60px]`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </CrmField>
        {pickedComponents.length > 0 && (
          <div className="px-3 py-2.5 rounded-lg border border-[#B47B2A]/40 bg-[#B47B2A]/5">
            <div className="text-[12px] font-semibold text-[#B47B2A] mb-1">🎁 묶음 구성 (함께 발급)</div>
            <ul className="space-y-0.5">
              {pickedComponents.map((c, i) => (
                <li key={i} className="flex items-baseline justify-between text-[12px] text-[#6B5D47] dark:text-zinc-400">
                  <span className="truncate">+ {c.name || "구성 상품"} {c.billing_mode === "count" ? `${c.total_sessions ?? 0}회` : `${c.duration_value ?? 0}일`}</span>
                  <span className="tabular-nums shrink-0 ml-2">{formatWon(c.price_won ?? 0)}원</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 pt-1.5 border-t border-[#B47B2A]/20 flex items-baseline justify-between text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
              <span>묶음 합계</span>
              <span className="tabular-nums">
                {formatWon(priceWon + pickedComponents.reduce((s, c) => s + Math.max(0, Math.floor(c.price_won ?? 0)), 0))}원
              </span>
            </div>
          </div>
        )}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {/* 최종 결제 금액 = (결제금액 − 할인) + 묶음 구성 합 */}
        <div className="flex items-baseline justify-between px-1 mt-1.5">
          <span className="text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-200">최종 결제 금액</span>
          <span className="text-[17px] font-bold text-[#6B7B3A] dark:text-[#A8B87A] tabular-nums">
            {formatWon(
              Math.max(0, priceWon - discountWon) +
                pickedComponents.reduce((s, c) => s + Math.max(0, Math.floor(c.price_won ?? 0)), 0)
            )}
            원
          </span>
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] mt-2"
        >
          {submitting ? "발급 중…" : pickedComponents.length > 0 ? "묶음 상품 발급" : "수강권 발급"}
        </button>
      </div>
    </CrmModal>
  );
}

/** 전자 계약서 작성 요청 — 어떤 계약서 양식으로 보낼지 고른 뒤 회원 앱으로 전송. 수강권/회원권 공용. */
function ContractRequestPickerModal({
  open,
  memberId,
  passId,
  membershipId,
  onClose,
}: {
  open: boolean;
  memberId: number;
  passId?: number;
  membershipId?: number;
  onClose: () => void;
}) {
  const { getIdToken } = useAuth();
  const [templates, setTemplates] = useState<{ id: number; title: string; category: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // 계약자(직원) 서명 패드
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSelectedId(null);
    setSignatureEmpty(true);
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        const res = await fetch("/api/crm/contracts", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        const list = (data.contracts ?? []) as { id: number; title: string; category: string }[];
        setTemplates(list);
        // 양식이 1개여도 자동 선택하지 않고, 직원이 직접 계약서를 고르도록 함
      } catch {
        setError("계약서 양식을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, getIdToken]);

  // 템플릿 선택 시 서명 캔버스 초기화 (선택 바뀌면 서명도 리셋)
  useEffect(() => {
    if (!open || selectedId === null) return;
    setSignatureEmpty(true);
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2A251D";
  }, [open, selectedId]);

  const sigPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const sigStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = sigPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const sigDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = sigPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setSignatureEmpty(false);
  };
  const sigEnd = () => {
    drawingRef.current = false;
  };
  const clearSig = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setSignatureEmpty(true);
  };

  const send = async (force = false) => {
    if (!selectedId || sending) return;
    if (signatureEmpty) {
      setError("계약자(직원) 서명을 먼저 완료해 주세요.");
      return;
    }
    const trainerSig = canvasRef.current?.toDataURL("image/png") ?? "";
    setSending(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/contracts/sign/request", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_id: memberId,
          ...(passId ? { pass_id: passId } : {}),
          ...(membershipId ? { membership_id: membershipId } : {}),
          template_id: selectedId,
          notify_app: true,
          trainer_signature_data_url: trainerSig,
          force,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "요청 실패");
      // 같은 계약서로 이미 요청한 pending 이 있으면 중복 전송 대신 물어본다.
      if (data.duplicate && data.existing) {
        setSending(false);
        const again = window.confirm(
          "이미 이 계약서로 작성을 요청한 내역이 있어요.\n\n[확인] 기존 요청을 유지(중복 전송 안 함)\n[취소] 새 계약서로 다시 요청(기존 요청은 대체)"
        );
        if (again) {
          onClose();
        } else {
          await send(true);
        }
        return;
      }
      alert(
        data.notified
          ? "회원 앱으로 전자 계약서 작성 요청을 보냈어요. 회원이 앱에서 약관 동의와 서명을 완료하면 계약이 등록돼요."
          : "회원이 앱을 열면 알림함에서 확인할 수 있어요. 앱 알림이 꺼져 있으면 폰 알림음은 안 울릴 수 있어요."
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSending(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="전자 계약서 작성 요청">
      <div className="space-y-3">
        <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          어떤 계약서로 작성을 요청할지 선택하고, 계약자(직원) 서명을 완료하면 회원용 앱으로 서명 요청이 전송됩니다.
        </p>
        {!loading && templates.length > 0 && (
          <div className="text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            ① 계약서 선택
          </div>
        )}
        {loading ? (
          <div className="py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : templates.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            등록된 계약서 양식이 없어요. 설정 → 계약서 관리에서 먼저 양식을 등록해 주세요.
          </div>
        ) : (
          <ul className={`space-y-2 overflow-y-auto ${selectedId !== null ? "max-h-[24vh]" : "max-h-[46vh]"}`}>
            {templates.map((t) => {
              const sel = selectedId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors ${
                      sel
                        ? "border-[#6B7B3A] bg-[#6B7B3A]/8 dark:bg-[#6B7B3A]/20"
                        : "border-[#E8E0D0] dark:border-zinc-700 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          sel ? "border-[#6B7B3A] bg-[#6B7B3A] text-white" : "border-[#C7B89B]"
                        }`}
                      >
                        {sel && (
                          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">{t.title}</span>
                      {t.category && (
                        <span className="ml-auto text-[11px] text-[#A89B80]">{t.category}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selectedId !== null && (
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
              ② 계약자(직원) 서명
            </div>
            <div className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                className="block w-full h-36 touch-none cursor-crosshair"
                onMouseDown={sigStart}
                onMouseMove={sigDraw}
                onMouseUp={sigEnd}
                onMouseLeave={sigEnd}
                onTouchStart={sigStart}
                onTouchMove={sigDraw}
                onTouchEnd={sigEnd}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[12px] text-[#A89B80]">
                {signatureEmpty ? "여기에 직원 서명을 해주세요" : "서명 완료"}
              </span>
              <button
                type="button"
                onClick={clearSig}
                className="text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:underline"
              >
                서명 지우기
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300">{error}</div>
        )}
        {templates.length > 0 && (
          <button
            type="button"
            onClick={() => send()}
            disabled={!selectedId || signatureEmpty || sending}
            className="w-full px-4 py-2.5 rounded-lg bg-[#B47B2A] text-white text-[13.5px] font-semibold hover:bg-[#9c682a] disabled:opacity-50"
          >
            {sending
              ? "요청 보내는 중…"
              : !selectedId
                ? "계약서를 선택하세요"
                : signatureEmpty
                  ? "직원 서명 후 요청 보내기"
                  : "서명 완료 · 작성 요청 보내기"}
          </button>
        )}
      </div>
    </CrmModal>
  );
}

/** 추가 강사(공동 진행) 다중 선택 — 칩 + 드롭다운으로 추가/삭제 */
function CoTrainerPicker({
  staffList,
  primaryId,
  value,
  onChange,
}: {
  staffList: { id: number; display_name: string; role: string; status: string }[];
  primaryId: number | "";
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const nameOf = (id: number) => staffList.find((s) => s.id === id)?.display_name ?? `#${id}`;
  const selectable = staffList.filter(
    (s) => s.status === "active" && s.id !== primaryId && !value.includes(s.id)
  );
  return (
    <div>
      <div className="text-[12px] text-[#8C8270] dark:text-zinc-500 mb-1">추가 강사 (공동 진행)</div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#6B7B3A]/12 text-[#4d5a28] dark:text-[#A8B87A] text-[12px]"
            >
              {nameOf(id)}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== id))}
                className="text-[#8C8270] hover:text-red-600"
                title="제거"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) onChange([...value, id]);
        }}
        className={crmInputClass}
        disabled={selectable.length === 0}
      >
        <option value="">
          {selectable.length === 0 ? "추가할 강사 없음" : "+ 추가 강사 선택"}
        </option>
        {selectable.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name} ({s.role})
          </option>
        ))}
      </select>
    </div>
  );
}

function PassDetailModal({
  passId,
  staffList,
  startInEdit,
  onClose,
  onRefunded,
}: {
  passId: number | null;
  staffList: { id: number; display_name: string; role: string; status: string }[];
  startInEdit?: boolean;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const { getIdToken } = useAuth();
  const [detail, setDetail] = useState<{
    pass: Pass & {
      seller_member_id: number;
      vat_included: boolean;
      memo: string | null;
      created_at: string;
    };
    member: { id: number; name: string; phone: string } | null;
    reservations: {
      id: number;
      starts_at: string;
      ends_at: string;
      status: string;
      consumed: boolean;
    }[];
    co_trainers?: { id: number; name: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canRefund, setCanRefund] = useState(false);
  const [contractPickerOpen, setContractPickerOpen] = useState(false);
  // 수정 폼 값 (편집 시작 시 detail 로부터 초기화)
  const [editTrainerId, setEditTrainerId] = useState<number | "">("");
  const [editCoTrainerIds, setEditCoTrainerIds] = useState<number[]>([]);
  const [editSellerId, setEditSellerId] = useState<number | "">("");
  const [editLessonKind, setEditLessonKind] = useState("");
  const [editSessionMinutes, setEditSessionMinutes] = useState(60);
  const [editTotal, setEditTotal] = useState(0);
  const [editRemaining, setEditRemaining] = useState(0);
  const [editService, setEditService] = useState(0);
  const [editIssuedAt, setEditIssuedAt] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editExpires, setEditExpires] = useState("");
  const [editPriceWon, setEditPriceWon] = useState(0);
  const [editVatIncluded, setEditVatIncluded] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("card");
  const [editPaymentCustom, setEditPaymentCustom] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editAttendanceMileageEnabled, setEditAttendanceMileageEnabled] = useState(false);
  const [editAttendanceMileageEarn, setEditAttendanceMileageEarn] = useState(0);
  const [saving, setSaving] = useState(false);

  // 수강권 수정 권한 조회
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
          setCanEdit(!!data?.permissions?.["passes.edit"]);
          setCanRefund(!!data?.permissions?.["passes.refund"]);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [getIdToken]);

  useEffect(() => {
    setEditing(false); // 열 때마다 보기 모드로 초기화 (startInEdit 이면 아래 이펙트가 편집으로 전환)
    if (passId === null) {
      setDetail(null);
      setError("");
      return;
    }
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getIdToken();
        if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
        const res = await fetch(`/api/crm/passes/${passId}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setDetail(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [passId, getIdToken]);

  const refund = async () => {
    if (!detail || refunding) return;
    if (!window.confirm("이 수강권을 환불 처리할까요? 잔여 세션은 자동 정리되지 않으니 필요하면 따로 예약을 정리해 주세요.")) {
      return;
    }
    setRefunding(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/passes/${detail.pass.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "환불 실패");
      onRefunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setRefunding(false);
    }
  };

  const startEdit = () => {
    if (!detail?.pass) return;
    const p = detail.pass;
    setEditTrainerId(p.trainer_member_id);
    setEditCoTrainerIds((detail.co_trainers ?? []).map((c) => c.id));
    setEditSellerId(p.seller_member_id);
    setEditLessonKind(p.lesson_kind ?? "");
    setEditSessionMinutes(p.session_minutes ?? 50);
    setEditTotal(p.total_sessions ?? 0);
    setEditRemaining(p.remaining_sessions ?? 0);
    setEditService(p.service_sessions ?? 0);
    setEditIssuedAt(p.issued_at ?? "");
    setEditStartDate((p as Pass & { start_date?: string | null }).start_date ?? "");
    setEditExpires(p.expires_at === "9999-12-31" ? "" : (p.expires_at ?? ""));
    setEditPriceWon(p.price_won ?? 0);
    setEditVatIncluded(!!p.vat_included);
    setEditPaymentMethod(p.payment_method || "card");
    setEditPaymentCustom(p.payment_method_custom ?? "");
    setEditMemo(p.memo ?? "");
    setEditAttendanceMileageEarn(p.attendance_mileage_earn ?? 0);
    setEditAttendanceMileageEnabled((p.attendance_mileage_earn ?? 0) > 0);
    setEditing(true);
    setError("");
  };

  // 결제내역 '수정' 진입 시(startInEdit) 권한 확인 후 바로 편집 폼으로 시작
  useEffect(() => {
    if (startInEdit && detail?.pass && canEdit && !editing) startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startInEdit, detail, canEdit]);

  const saveEdit = async () => {
    if (!detail?.pass || saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/passes/${detail.pass.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          trainer_member_id: editTrainerId || undefined,
          co_trainer_ids: editCoTrainerIds,
          seller_member_id: editSellerId || undefined,
          lesson_kind: editLessonKind || undefined,
          session_minutes: editSessionMinutes,
          total_sessions: editTotal,
          remaining_sessions: Math.min(editRemaining, editTotal),
          service_sessions: editService,
          issued_at: editIssuedAt || undefined,
          start_date: editStartDate || undefined,
          expires_at: editExpires || undefined,
          price_won: editPriceWon,
          vat_included: editVatIncluded,
          payment_method: editPaymentMethod,
          payment_method_custom: editPaymentMethod === "etc" ? editPaymentCustom : undefined,
          memo: editMemo,
          attendance_mileage_earn: editAttendanceMileageEnabled
            ? Math.max(0, editAttendanceMileageEarn)
            : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditing(false);
      onRefunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const open = passId !== null;
  const staffMap = new Map(staffList.map((s) => [s.id, s.display_name]));
  const pass = detail?.pass;
  const trainerName = pass ? staffMap.get(pass.trainer_member_id) ?? "—" : "—";
  const coTrainerNames = (detail?.co_trainers ?? [])
    .map((c) => c.name || staffMap.get(c.id) || "")
    .filter(Boolean)
    .join(", ");
  const sellerName = pass ? staffMap.get(pass.seller_member_id) ?? "—" : "—";
  const paymentLabel = pass
    ? pass.payment_method === "etc" && pass.payment_method_custom
      ? `${pass.payment_method_custom} (기타)`
      : PAYMENT_METHOD_LABEL[pass.payment_method] ?? pass.payment_method
    : "";


  return (
    <>
    <CrmModal open={open} onClose={onClose} title="수강권 상세" size="lg">
      {loading ? (
        <div className="text-[13px] text-[#8C8270] py-6 text-center">불러오는 중…</div>
      ) : !detail || !pass ? (
        <div className="text-[13px] text-red-700 py-6 text-center">{error || "정보를 불러올 수 없습니다."}</div>
      ) : (
        <div className="space-y-4">
          <div className="px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/60">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">
                {pass.lesson_kind}
              </span>
              <PassStatusChip status={pass.status} />
            </div>
            <div className="mt-1.5 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              {ISSUE_TYPE_LABEL[pass.issue_type] ?? pass.issue_type} ·{" "}
              잔여 <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{pass.remaining_sessions}</strong>/{pass.total_sessions}회 ·{" "}
              {pass.session_minutes}분 수업
            </div>
          </div>

          <DetailGrid
            rows={[
              ["회원", detail.member?.name ?? "—"],
              ["담당 강사", trainerName],
              ...(coTrainerNames ? [["추가 강사", coTrainerNames] as [string, string]] : []),
              ["판매 직원", sellerName],
              ["발급일", pass.issued_at],
              [
                "시작일",
                (pass as Pass & { start_date?: string }).start_date ?? pass.issued_at,
              ],
              ["만료일", pass.expires_at === "9999-12-31" ? "무기한" : pass.expires_at],
              ["결제 금액", `${formatWon(pass.price_won)}원${pass.vat_included ? " (부가세 포함)" : ""}`],
              ["결제 수단", paymentLabel],
            ]}
          />

          {!editing && pass.status === "valid" && detail.member && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/crm/contracts/sign/new?member_id=${detail.member.id}&pass_id=${pass.id}`}
                className="inline-flex px-3 py-1.5 rounded-lg border border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 text-[12.5px] font-semibold hover:bg-amber-50/60"
              >
                전자 계약서
              </Link>
              <button
                type="button"
                onClick={() => setContractPickerOpen(true)}
                className="inline-flex px-3 py-1.5 rounded-lg bg-[#B47B2A] text-white text-[12.5px] font-semibold hover:bg-[#9c682a]"
              >
                전자 계약서 작성 요청
              </button>
            </div>
          )}

          {editing && (
            <div className="rounded-2xl border-2 border-[#6B7B3A]/40 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 p-4 space-y-3">
              <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
                수강권 수정
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CrmField label="담당 강사">
                  <select
                    value={editTrainerId}
                    onChange={(e) =>
                      setEditTrainerId(e.target.value ? Number(e.target.value) : "")
                    }
                    className={crmInputClass}
                  >
                    <option value="">선택</option>
                    {staffList
                      .filter((s) => s.status === "active")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display_name} ({s.role})
                        </option>
                      ))}
                  </select>
                </CrmField>
                <div className="col-span-2">
                  <CoTrainerPicker
                    staffList={staffList}
                    primaryId={editTrainerId}
                    value={editCoTrainerIds}
                    onChange={setEditCoTrainerIds}
                  />
                </div>
                <CrmField label="판매 직원">
                  <select
                    value={editSellerId}
                    onChange={(e) =>
                      setEditSellerId(e.target.value ? Number(e.target.value) : "")
                    }
                    className={crmInputClass}
                  >
                    <option value="">선택</option>
                    {staffList
                      .filter((s) => s.status === "active")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display_name} ({s.role})
                        </option>
                      ))}
                  </select>
                </CrmField>
                <CrmField label="수업 종류">
                  <input
                    type="text"
                    value={editLessonKind}
                    onChange={(e) => setEditLessonKind(e.target.value)}
                    className={crmInputClass}
                    placeholder="예: PT 개인 레슨"
                  />
                </CrmField>
                <CrmField label="회당 수업 시간(분)">
                  <input
                    type="number"
                    min={0}
                    value={editSessionMinutes}
                    onChange={(e) =>
                      setEditSessionMinutes(Math.max(0, Number(e.target.value) || 0))
                    }
                    className={crmInputClass}
                  />
                </CrmField>
                <CrmField label="총 세션">
                  <input
                    type="number"
                    min={0}
                    value={editTotal}
                    onChange={(e) => setEditTotal(Math.max(0, Number(e.target.value) || 0))}
                    className={crmInputClass}
                  />
                </CrmField>
                <CrmField label="잔여 세션">
                  <input
                    type="number"
                    min={0}
                    max={editTotal}
                    value={editRemaining}
                    onChange={(e) =>
                      setEditRemaining(Math.max(0, Number(e.target.value) || 0))
                    }
                    className={crmInputClass}
                  />
                </CrmField>
                <CrmField label="서비스 세션">
                  <input
                    type="number"
                    min={0}
                    value={editService}
                    onChange={(e) => setEditService(Math.max(0, Number(e.target.value) || 0))}
                    className={crmInputClass}
                  />
                  <p className="mt-1 text-[11.5px] text-[#A89B80]">무료 보너스 세션 · 수업료 미포함</p>
                </CrmField>
                <CrmField label="발급일">
                  <input
                    type="date"
                    value={editIssuedAt}
                    onChange={(e) => setEditIssuedAt(e.target.value)}
                    className={crmInputClass}
                  />
                </CrmField>
                <CrmField label="시작일">
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className={crmInputClass}
                  />
                </CrmField>
                <CrmField label="만료일">
                  <input
                    type="date"
                    value={editExpires}
                    onChange={(e) => setEditExpires(e.target.value)}
                    className={crmInputClass}
                  />
                </CrmField>
                <CrmField label="결제 금액(원)">
                  <input
                    className={`${crmInputClass} text-right`}
                    value={editPriceWon ? formatWon(editPriceWon) : ""}
                    onChange={(e) => setEditPriceWon(parseWon(e.target.value))}
                    inputMode="numeric"
                  />
                </CrmField>
                <CrmField label="결제 수단">
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                    className={crmInputClass}
                  >
                    {(["card", "cash", "transfer", "etc"] as const).map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </CrmField>
                {editPaymentMethod === "etc" && (
                  <CrmField label="결제 수단 직접 입력">
                    <input
                      className={crmInputClass}
                      value={editPaymentCustom}
                      onChange={(e) => setEditPaymentCustom(e.target.value)}
                      placeholder="예: 상품권"
                    />
                  </CrmField>
                )}
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={editVatIncluded}
                  onChange={(e) => setEditVatIncluded(e.target.checked)}
                />
                부가세 포함 금액
              </label>
              <CrmField label="메모">
                <textarea
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  className={`${crmInputClass} min-h-[60px]`}
                />
              </CrmField>

              <div className="rounded-lg border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 px-3 py-2.5">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={editAttendanceMileageEnabled}
                    onChange={(e) => setEditAttendanceMileageEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#6B7B3A]"
                  />
                  출석 시 마일리지 적립
                </label>
                {editAttendanceMileageEnabled && (
                  <div className="mt-2 relative max-w-[200px]">
                    <input
                      type="number"
                      min={0}
                      value={editAttendanceMileageEarn}
                      onChange={(e) =>
                        setEditAttendanceMileageEarn(Math.max(0, Number(e.target.value) || 0))
                      }
                      className={`${crmInputClass} pr-9`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#A89B80]">
                      P
                    </span>
                  </div>
                )}
                <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
                  이 수강권으로 체크인할 때마다 자동 적립 (하루 1회)
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
          )}

          {!editing && pass.memo && (
            <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
              <strong className="text-[#3A342A] dark:text-zinc-300">메모 ·</strong> {pass.memo}
            </div>
          )}

          <section>
            <h3 className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
              수업 내역 ({detail.reservations.length})
            </h3>
            {detail.reservations.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                아직 예약·수업 기록이 없습니다.
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {detail.reservations.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#E8E0D0]/60 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 text-[12.5px]"
                  >
                    <span className="text-[#3A342A] dark:text-zinc-300">
                      {formatDateRange(r.starts_at, r.ends_at)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[#8C8270] dark:text-zinc-500">
                      <PassReservationChip status={r.status} />
                      <span className={r.consumed ? "text-[#B47B2A]" : "text-[#A89B80]"}>
                        {r.consumed ? "차감" : "미차감"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {canEdit && !editing && pass.status === "valid" && (
              <button
                onClick={startEdit}
                disabled={refunding}
                className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[13.5px] font-semibold hover:bg-[#6B7B3A]/8 disabled:opacity-50"
              >
                수강권 수정
              </button>
            )}
            {pass.status === "valid" && (
              <button
                onClick={() => setHoldOpen(true)}
                disabled={refunding}
                className={`flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border text-[13.5px] font-semibold disabled:opacity-60
                  ${(pass as Pass).is_paused
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : "border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 hover:bg-amber-50/60"
                  }`}
              >
                {(pass as Pass).is_paused ? "홀딩중" : "홀딩"}
              </button>
            )}
            {pass.status === "valid" && canRefund && (
              <button
                onClick={refund}
                disabled={refunding}
                className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[13.5px] font-semibold hover:bg-red-50 disabled:opacity-60"
              >
                {refunding ? "처리 중…" : "환불 처리"}
              </button>
            )}
            {/* 닫기: 항상 맨 오른쪽 */}
            <button
              onClick={onClose}
              disabled={refunding}
              className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <HoldModal
        open={holdOpen}
        passId={pass?.id ?? null}
        membershipId={null}
        onClose={() => setHoldOpen(false)}
        onDone={() => {
          setHoldOpen(false);
          onRefunded(); // 모달 닫고 부모 갱신 (이름은 refund지만 그냥 reload 트리거)
        }}
      />
    </CrmModal>
    <ContractRequestPickerModal
      open={contractPickerOpen}
      memberId={detail?.member?.id ?? 0}
      passId={pass?.id}
      onClose={() => setContractPickerOpen(false)}
    />
    </>
  );
}

function DetailGrid({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[#A89B80] dark:text-zinc-500">{k}</dt>
          <dd className="text-[#2A251D] dark:text-zinc-100 font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PassReservationChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    booked: { label: "예약완료", cls: "bg-[#F5E4C8] text-[#B47B2A]" },
    attended: { label: "출석완료", cls: "bg-[#EFE7D5] text-[#6B7B3A]" },
    cancelled: { label: "예약취소", cls: "bg-[#F5F0E5] text-[#A89B80]" },
    noshow: { label: "노쇼", cls: "bg-red-50 text-red-700" },
  };
  const v = map[status] ?? { label: status, cls: "bg-[#F5F0E5] text-[#A89B80]" };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${v.cls}`}>
      {v.label}
    </span>
  );
}

function formatDateRange(startIso: string, endIso: string) {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const sk = new Date(s.getTime() + 9 * 3600 * 1000);
    const ek = new Date(e.getTime() + 9 * 3600 * 1000);
    const date = `${sk.getUTCFullYear()}-${String(sk.getUTCMonth() + 1).padStart(2, "0")}-${String(sk.getUTCDate()).padStart(2, "0")}`;
    const st = `${String(sk.getUTCHours()).padStart(2, "0")}:${String(sk.getUTCMinutes()).padStart(2, "0")}`;
    const et = `${String(ek.getUTCHours()).padStart(2, "0")}:${String(ek.getUTCMinutes()).padStart(2, "0")}`;
    return `${date} ${st}~${et}`;
  } catch {
    return startIso;
  }
}

/* ─── 신체 측정 (인바디) 섹션 ────────────────────────────── */

interface Measurement {
  id: number;
  measured_at: string;
  weight_kg: number | null;
  muscle_kg: number | null;
  body_fat_kg: number | null;
  body_fat_pct: number | null;
  bmi: number | null;
  height_cm: number | null;
  memo: string | null;
}

function BodyMeasurementSection({
  memberId,
  onOpen,
  reloadKey = 0,
}: {
  memberId: number;
  onOpen: () => void;
  reloadKey?: number;
}) {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/members/${memberId}/measurements`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setList(data.measurements ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId]);

  // 최초 로드 + 저장(reloadKey 변경) 시에만 갱신. (5초 폴링 제거 — 계속 새로고침되던 원인)
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // 최신 → 오래된 순. 차트는 오래된 → 최신 순.
  const chronological = [...list].reverse();
  const latest = list[0];

  const weightPoints = chronological
    .filter((m) => m.weight_kg !== null)
    .map((m) => ({ label: m.measured_at.slice(5), value: Number(m.weight_kg) }));
  const fatPctPoints = chronological
    .filter((m) => m.body_fat_pct !== null)
    .map((m) => ({ label: m.measured_at.slice(5), value: Number(m.body_fat_pct) }));
  const musclePoints = chronological
    .filter((m) => m.muscle_kg !== null)
    .map((m) => ({ label: m.measured_at.slice(5), value: Number(m.muscle_kg) }));

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          신체 측정 (인바디) {list.length > 0 && <span className="ml-1 text-[12px] text-[#A89B80] font-normal">{list.length}건</span>}
        </h2>
        <button
          onClick={onOpen}
          className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
        >
          + 측정 기록
        </button>
      </div>

      {loading && list.length === 0 ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          신체 측정 기록이 없어요. &quot;+ 측정 기록&quot;으로 추가해 주세요.
        </div>
      ) : (
        <>
          {/* 최신 KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {latest.weight_kg !== null && (
              <BodyKpi label="체중" value={`${latest.weight_kg} kg`} />
            )}
            {latest.muscle_kg !== null && (
              <BodyKpi label="골격근량" value={`${latest.muscle_kg} kg`} />
            )}
            {latest.body_fat_kg !== null && (
              <BodyKpi label="체지방량" value={`${latest.body_fat_kg} kg`} />
            )}
            {latest.body_fat_pct !== null && (
              <BodyKpi label="체지방률" value={`${latest.body_fat_pct} %`} />
            )}
          </div>

          {/* 차트 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            {weightPoints.length > 1 && (
              <div className="px-4 py-3 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                <h3 className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200 mb-1.5">체중 추이</h3>
                <CrmLineChart points={weightPoints} unit="kg" height={140} />
              </div>
            )}
            {fatPctPoints.length > 1 && (
              <div className="px-4 py-3 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                <h3 className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200 mb-1.5">체지방률 추이</h3>
                <CrmLineChart points={fatPctPoints} unit="%" color="#B47B2A" height={140} />
              </div>
            )}
            {musclePoints.length > 1 && (
              <div className="px-4 py-3 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                <h3 className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200 mb-1.5">골격근량 추이</h3>
                <CrmLineChart points={musclePoints} unit="kg" color="#6B7B3A" height={140} />
              </div>
            )}
          </div>

          {/* 측정 기록 테이블 */}
          <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
            <table className="w-full text-[13px]">
              <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
                <tr>
                  <Th>측정일</Th>
                  <Th>체중(kg)</Th>
                  <Th>골격근(kg)</Th>
                  <Th>체지방(kg)</Th>
                  <Th>체지방률(%)</Th>
                  <Th>BMI</Th>
                  <Th>메모</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                    <Td className="font-medium">{m.measured_at}</Td>
                    <Td>{m.weight_kg ?? "—"}</Td>
                    <Td>{m.muscle_kg ?? "—"}</Td>
                    <Td>{m.body_fat_kg ?? "—"}</Td>
                    <Td>{m.body_fat_pct ?? "—"}</Td>
                    <Td>{m.bmi ?? "—"}</Td>
                    <Td className="text-[#8C8270] max-w-[200px] truncate" title={m.memo || ""}>
                      <span className="block truncate" title={m.memo || ""}>{m.memo || "—"}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function BodyKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div className="mt-0.5 text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}
function Td({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-3 py-2 whitespace-nowrap ${className || ""}`} title={title}>{children}</td>;
}

function BodyMeasurementModal({
  memberId,
  open,
  onClose,
  onDone,
}: {
  memberId: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [muscle, setMuscle] = useState("");
  const [fatKg, setFatKg] = useState("");
  const [fatPct, setFatPct] = useState("");
  const [bmi, setBmi] = useState("");
  const [height, setHeight] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setMeasuredAt(new Date().toISOString().slice(0, 10));
      setWeight("");
      setMuscle("");
      setFatKg("");
      setFatPct("");
      setBmi("");
      setHeight("");
      setMemo("");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    setError("");
    if (!measuredAt) return setError("측정일을 입력해 주세요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}/measurements`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          measured_at: measuredAt,
          weight_kg: weight ? Number(weight) : undefined,
          muscle_kg: muscle ? Number(muscle) : undefined,
          body_fat_kg: fatKg ? Number(fatKg) : undefined,
          body_fat_pct: fatPct ? Number(fatPct) : undefined,
          bmi: bmi ? Number(bmi) : undefined,
          height_cm: height ? Number(height) : undefined,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="신체 측정 기록" size="lg">
      <div className="space-y-3">
        <CrmField label="측정일" required>
          <input
            type="date"
            className={crmInputClass}
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
          />
        </CrmField>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <CrmField label="체중 (kg)">
            <input className={crmInputClass} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </CrmField>
          <CrmField label="골격근량 (kg)">
            <input className={crmInputClass} inputMode="decimal" value={muscle} onChange={(e) => setMuscle(e.target.value)} />
          </CrmField>
          <CrmField label="체지방량 (kg)">
            <input className={crmInputClass} inputMode="decimal" value={fatKg} onChange={(e) => setFatKg(e.target.value)} />
          </CrmField>
          <CrmField label="체지방률 (%)">
            <input className={crmInputClass} inputMode="decimal" value={fatPct} onChange={(e) => setFatPct(e.target.value)} />
          </CrmField>
          <CrmField label="BMI">
            <input className={crmInputClass} inputMode="decimal" value={bmi} onChange={(e) => setBmi(e.target.value)} />
          </CrmField>
          <CrmField label="키 (cm)">
            <input className={crmInputClass} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
          </CrmField>
        </div>
        <CrmField label="메모">
          <textarea className={`${crmInputClass} min-h-[60px]`} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] mt-2"
        >
          {submitting ? "저장 중…" : "저장"}
        </button>
      </div>
    </CrmModal>
  );
}

interface SignedContractRow {
  id: number;
  title: string;
  signed_at: string;
  status: string;
  signing_token: string | null;
  requested_at: string | null;
}

/** '+ 전자 계약서 작성' — 센터가 등록한 양식 중에서 고른 뒤 sign/new(현장 작성)로 이동. */
function WriteContractPickerModal({
  open,
  memberId,
  onClose,
}: {
  open: boolean;
  memberId: number;
  onClose: () => void;
}) {
  const { getIdToken } = useAuth();
  const [templates, setTemplates] = useState<{ id: number; title: string; category: string }[]>([]);
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
        // 회원 계약 흐름에는 직원(근로) 계약서 양식 제외
        const list = ((data.contracts ?? []) as { id: number; title: string; category: string }[]).filter(
          (t) => t.category !== "employment"
        );
        setTemplates(list);
      } catch {
        setError("계약서 양식을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, getIdToken]);

  const pick = (tplId: number) => {
    if (typeof window !== "undefined") {
      window.location.href = `/crm/contracts/sign/new?member_id=${memberId}&template_id=${tplId}`;
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="전자 계약서 작성">
      <div className="space-y-3">
        <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          어떤 계약서로 작성할지 선택하세요. 이 센터에 등록된 양식만 사용할 수 있어요.
        </p>
        {loading ? (
          <div className="py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : templates.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            등록된 계약서 양식이 없어요.{" "}
            <a
              href="/crm/settings?tab=contracts"
              className="text-[#6B7B3A] dark:text-[#A8B87A] font-semibold hover:underline"
            >
              설정 → 계약서 관리에서 먼저 양식을 등록해 주세요.
            </a>
          </div>
        ) : (
          <ul className="space-y-2 max-h-[52vh] overflow-y-auto">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => pick(t.id)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">{t.title}</span>
                  {t.category && <span className="ml-2 text-[11px] text-[#A89B80]">{t.category}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300">{error}</div>
        )}
      </div>
    </CrmModal>
  );
}

function SignedContractsSection({ memberId }: { memberId: number }) {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<SignedContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [managePending, setManagePending] = useState<SignedContractRow | null>(null);

  const reload = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/contracts/sign?member_id=${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setList(data.contracts ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-[15px] md:text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">
          체결 계약서 ({list.length})
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRequestOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-[#6B7B3A] text-[12.5px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#6B7B3A]/5"
          >
            요청 링크 생성
          </button>
          <button
            type="button"
            onClick={() => setWriteOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-[#B47B2A] text-[12.5px] font-semibold text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 hover:bg-amber-50/60"
          >
            + 전자 계약서 작성
          </button>
        </div>
      </div>

      <WriteContractPickerModal
        open={writeOpen}
        memberId={memberId}
        onClose={() => setWriteOpen(false)}
      />

      <RequestLinkModal
        open={requestOpen}
        memberId={memberId}
        onClose={() => setRequestOpen(false)}
        onCreated={async (createdId) => {
          setRequestOpen(false);
          // 리스트 리로드 후 방금 만든 요청의 row 를 찾아 요청 관리 모달을 바로 오픈
          try {
            const token = await getIdToken();
            if (!token) return;
            const res = await fetch(`/api/crm/contracts/sign?member_id=${memberId}`, {
              headers: { authorization: `Bearer ${token}` },
              cache: "no-store",
            });
            const data = await res.json();
            const next: SignedContractRow[] = data.contracts ?? [];
            setList(next);
            const created = next.find((c) => c.id === createdId);
            if (created) setManagePending(created);
          } finally {
            setLoading(false);
          }
        }}
      />
      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          이 회원의 체결된 계약서가 없어요.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {list.map((c) => {
            const isPending = c.status === "pending_signature";
            const badgeAndSub = isPending ? (
              <>
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-[#F5E4C8]/70 text-[#B47B2A] dark:bg-amber-950/40 dark:text-amber-300">
                  요청됨
                </span>
              </>
            ) : c.status === "voided" ? (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-red-50 text-red-700">
                무효
              </span>
            ) : null;
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                    {c.title}
                  </span>
                  {badgeAndSub}
                </div>
                <div className="mt-1 text-[11.5px] text-[#A89B80]">
                  {isPending
                    ? "회원 서명 대기 중 · 클릭해 링크 다시 보기 / 취소"
                    : `서명일: ${new Date(c.signed_at).toISOString().slice(0, 10)}`}
                </div>
              </>
            );
            const cls =
              "block px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors w-full text-left";
            return (
              <li key={c.id}>
                {isPending ? (
                  <button
                    type="button"
                    onClick={() => setManagePending(c)}
                    className={cls}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link href={`/crm/contracts/signed/${c.id}`} className={cls}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ManagePendingModal
        pending={managePending}
        onClose={() => setManagePending(null)}
        onCancelled={() => {
          setManagePending(null);
          reload();
        }}
      />
    </section>
  );
}

function ManagePendingModal({
  pending,
  onClose,
  onCancelled,
}: {
  pending: SignedContractRow | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { getIdToken } = useAuth();
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pending) {
      setCopied(false);
      setError("");
    }
  }, [pending]);

  if (!pending) return null;

  const link = pending.signing_token
    ? `${window.location.origin}/contract/sign/${pending.signing_token}`
    : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const cancel = async () => {
    if (!window.confirm("이 요청을 취소할까요? 링크는 즉시 무효화됩니다.")) return;
    setCancelling(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/contracts/sign/${pending.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "취소 실패");
      onCancelled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <CrmModal open={true} onClose={onClose} title="요청 관리">
      <div className="space-y-3">
        <div>
          <div className="text-[12px] text-[#A89B80] mb-1">계약서</div>
          <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
            {pending.title}
          </div>
          {pending.requested_at && (
            <div className="mt-0.5 text-[11.5px] text-[#8C8270]">
              요청일: {new Date(pending.requested_at).toISOString().slice(0, 10)}
            </div>
          )}
        </div>

        {link ? (
          <>
            <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              아래 링크를 회원에게 다시 전달하거나 요청을 취소할 수 있어요.
            </p>
            <div className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-900 break-all text-[12.5px] text-[#3A342A] dark:text-zinc-200 font-mono">
              {link}
            </div>
          </>
        ) : (
          <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 text-[12.5px] text-[#8C8270]">
            링크 정보가 없어요. 취소하고 다시 요청해 주세요.
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
          >
            닫기
          </button>
          {link && (
            <button
              type="button"
              onClick={copy}
              className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
            >
              {copied ? "복사됨!" : "링크 복사"}
            </button>
          )}
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling}
            className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-red-200 text-red-700 text-[13.5px] font-semibold hover:bg-red-50 disabled:opacity-60"
          >
            {cancelling ? "취소 중…" : "요청 취소"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

function RequestLinkModal({
  open,
  memberId,
  onClose,
  onCreated,
}: {
  open: boolean;
  memberId: number;
  onClose: () => void;
  onCreated: (createdId: number) => void;
}) {
  const { getIdToken } = useAuth();
  const [templates, setTemplates] = useState<
    { id: number; title: string; category: string }[]
  >([]);
  const [templateId, setTemplateId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // 계약자(직원) 서명 — 링크 생성 전 우선 서명
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);

  useEffect(() => {
    if (!open) {
      setTemplateId("");
      setLink(null);
      setCopied(false);
      setError("");
      setSignatureEmpty(true);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/contracts?sort=name_asc", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          // 회원 계약 흐름에는 직원(근로) 계약서 양식 제외
          setTemplates(
            (data.contracts ?? []).filter(
              (t: { category: string }) => t.category !== "employment"
            )
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, getIdToken]);

  // 양식 선택 시 서명 캔버스 초기화
  useEffect(() => {
    if (!open || link || !templateId) return;
    setSignatureEmpty(true);
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2A251D";
  }, [open, link, templateId]);

  const sigPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const sigStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = sigPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const sigDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = sigPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setSignatureEmpty(false);
  };
  const sigEnd = () => {
    drawingRef.current = false;
  };
  const clearSig = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setSignatureEmpty(true);
  };

  const generate = async (force = false) => {
    setError("");
    if (!templateId) {
      return setError("계약서 양식을 선택해 주세요");
    }
    if (signatureEmpty) {
      return setError("계약자(직원) 서명을 먼저 완료해 주세요.");
    }
    const trainerSig = canvasRef.current?.toDataURL("image/png") ?? "";
    setCreating(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/contracts/sign/request", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_id: memberId,
          template_id: templateId,
          trainer_signature_data_url: trainerSig,
          force,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "요청 생성 실패");
      // 같은 계약서로 이미 요청한 pending 이 있으면 중복 생성 대신 물어본다.
      if (data.duplicate && data.existing) {
        setCreating(false);
        const reuse = window.confirm(
          "이미 이 계약서로 작성을 요청한 내역이 있어요.\n\n[확인] 기존 요청 링크를 다시 사용\n[취소] 새 계약서로 다시 요청(기존 요청은 대체)"
        );
        if (reuse) {
          if (data.existing.url) setLink(data.existing.url);
          onCreated(data.existing.id as number);
        } else {
          await generate(true);
        }
        return;
      }
      setLink(data.url);
      // 생성 성공 시 부모가 요청 관리 모달을 바로 열도록 id 전달
      onCreated(data.id as number);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 실패 시 사용자가 직접 선택 복사
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="전자 계약서 요청 링크 생성">
      <div className="space-y-3">
        {link ? (
          <>
            <p className="text-[13px] text-[#3A342A] dark:text-zinc-300">
              아래 링크를 회원에게 전달해 주세요. 회원이 링크로 접속해 서명하면 자동으로 체결됩니다.
            </p>
            <div className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-900 break-all text-[12.5px] text-[#3A342A] dark:text-zinc-200 font-mono">
              {link}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
              >
                {copied ? "복사됨!" : "링크 복사"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
              >
                닫기
              </button>
            </div>
            <p className="text-[11.5px] text-[#A89B80]">
              추후 회원 전용 앱이 출시되면 이 링크는 앱 푸시/인앱 메시지로 자동 전송됩니다.
            </p>
          </>
        ) : (
          <>
            <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              회원이 서명 화면에서 계약서 내용을 반드시 볼 수 있어야 하므로 양식은 필수입니다.
            </p>

            <CrmField label="계약서 양식" required>
              {loading ? (
                <div className="text-[12.5px] text-[#8C8270]">불러오는 중…</div>
              ) : templates.length === 0 ? (
                <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 text-[12.5px] text-[#8C8270]">
                  등록된 양식이 없어요.{" "}
                  <Link href="/crm/settings?tab=contracts" className="text-[#6B7B3A] hover:underline font-medium">
                    양식 만들러 가기 →
                  </Link>
                </div>
              ) : (
                <select
                  className={crmInputClass}
                  value={templateId}
                  onChange={(e) =>
                    setTemplateId(e.target.value ? Number(e.target.value) : "")
                  }
                >
                  <option value="">— 양식을 선택해 주세요 —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )}
            </CrmField>

            {templateId !== "" && (
              <CrmField label="계약자(직원) 서명" required>
                <div className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    className="block w-full h-36 touch-none cursor-crosshair"
                    onMouseDown={sigStart}
                    onMouseMove={sigDraw}
                    onMouseUp={sigEnd}
                    onMouseLeave={sigEnd}
                    onTouchStart={sigStart}
                    onTouchMove={sigDraw}
                    onTouchEnd={sigEnd}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[12px] text-[#A89B80]">
                    {signatureEmpty ? "여기에 직원 서명을 해주세요" : "서명 완료"}
                  </span>
                  <button
                    type="button"
                    onClick={clearSig}
                    className="text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:underline"
                  >
                    서명 지우기
                  </button>
                </div>
              </CrmField>
            )}

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => generate()}
                disabled={creating || !templateId || signatureEmpty}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
              >
                {creating
                  ? "생성 중…"
                  : !templateId
                    ? "양식을 선택하세요"
                    : signatureEmpty
                      ? "직원 서명 후 생성"
                      : "서명 완료 · 요청 링크 생성"}
              </button>
            </div>
          </>
        )}
      </div>
    </CrmModal>
  );
}

function BackLink() {
  const router = useRouter();
  const goBack = () => {
    // 이전 페이지(목록)로 진짜 뒤로가기 → 페이지 번호·스크롤 위치 그대로 복원
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/crm/members");
  };
  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A]"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      회원 목록
    </button>
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
        지금 작성하지 않아도 추후 회원 상세에서 발급한 수강권을 통해 작성할 수 있어요.
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

interface TemplateRow {
  id: number;
  category: string;
  title: string;
}

function TemplatePickerModal({
  open,
  onClose,
  memberId,
  passId,
}: {
  open: boolean;
  onClose: () => void;
  memberId: number;
  passId: number | null;
}) {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [list, setList] = useState<TemplateRow[]>([]);
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
    const params = new URLSearchParams();
    params.set("member_id", String(memberId));
    if (passId) params.set("pass_id", String(passId));
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
            href="/crm/settings?tab=contracts"
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
                <div className="mt-0.5 text-[11.5px] text-[#A89B80]">
                  카테고리: {t.category}
                </div>
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

function HoldModal({
  open,
  passId,
  membershipId,
  rentalId = null,
  onClose,
  onDone,
}: {
  open: boolean;
  passId: number | null;
  membershipId: number | null;
  rentalId?: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setStartDate(todayStr);
      setEndDate(todayStr);
      setReason("");
      setError("");
    }
  }, [open, todayStr]);

  const days = (() => {
    if (!startDate || !endDate || endDate < startDate) return 0;
    const a = new Date(`${startDate}T00:00:00Z`).getTime();
    const b = new Date(`${endDate}T00:00:00Z`).getTime();
    return Math.round((b - a) / (24 * 3600 * 1000)) + 1;
  })();

  const submit = async () => {
    setError("");
    if (!passId && !membershipId && !rentalId) return setError("대상이 없습니다");
    if (!startDate || !endDate) return setError("시작일과 종료일을 입력해 주세요");
    if (endDate < startDate) return setError("종료일이 시작일보다 빠를 수 없어요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/pauses", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          pass_id: passId,
          membership_id: membershipId,
          rental_id: rentalId,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "홀딩 실패");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="회원 홀딩">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="시작일" required>
            <input
              type="date"
              className={crmInputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </CrmField>
          <CrmField label="종료일" required>
            <input
              type="date"
              className={crmInputClass}
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </CrmField>
        </div>
        {days > 0 && (
          <div className="px-3 py-2 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
            홀딩 기간 <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{days}일</strong> ·
            만료일이 자동으로 {days}일 늘어납니다.
          </div>
        )}
        <CrmField label="홀딩 사유">
          <textarea
            className={`${crmInputClass} min-h-[72px]`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 부상, 해외 출장, 개인 사정 등"
            maxLength={300}
          />
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#B47B2A] disabled:opacity-60 text-white text-[13.5px] font-semibold hover:bg-[#9c6722]"
          >
            {submitting ? "처리 중…" : "홀딩 적용"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}
