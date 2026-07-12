"use client";

import { useCallback, useEffect, useState } from "react";
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
  created_at: string;
}
interface Pass {
  id: number;
  issue_type: string;
  lesson_kind: string;
  total_sessions: number;
  remaining_sessions: number;
  session_minutes: number;
  price_won: number;
  vat_included: boolean;
  payment_method: string;
  payment_method_custom: string | null;
  issued_at: string;
  expires_at: string;
  status: string;
  trainer_member_id: number;
  is_paused?: boolean;
}

export default function CrmMemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const memberId = Number(params.id);
  const { getIdToken } = useAuth();

  const [member, setMember] = useState<Member | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [staffList, setStaffList] = useState<
    { id: number; display_name: string; role: string; status: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [detailPassId, setDetailPassId] = useState<number | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);

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

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/members/${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setMember(data.member);
      setPasses(data.passes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId]);

  useEffect(() => {
    if (memberId) load();
  }, [memberId, load]);

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

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <BackLink />

      <header className="mt-3 mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            {member.name}
            <span className="ml-2 text-[12px] text-[#A89B80]">
              · {MEMBER_TYPE_LABEL[member.member_type] ?? member.member_type}
            </span>
          </h1>
          <div className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
            {formatPhone(member.phone)}
            {member.gender && ` · ${GENDER_LABEL[member.gender]}`}
            {member.birth && ` · ${member.birth}`}
          </div>
          {member.email && (
            <div className="mt-0.5 text-[12px] text-[#8C8270]">{member.email}</div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => setEditOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
          >
            정보 수정
          </button>
          <button
            onClick={remove}
            className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-[12.5px] text-red-700 dark:text-red-300 hover:bg-red-50"
          >
            회원 삭제
          </button>
        </div>
      </header>

      {member.memo && (
        <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
          {member.memo}
        </div>
      )}

      {(member.address ||
        member.visit_route ||
        member.workout_goal ||
        member.counselor ||
        member.mileage > 0 ||
        member.marketing_consent) && (
        <dl className="mb-5 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 px-3.5 py-3 rounded-lg border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
          {member.address && <InfoItem label="주소" value={member.address} />}
          {member.visit_route && <InfoItem label="방문 경로" value={member.visit_route} />}
          {member.workout_goal && <InfoItem label="운동 목적" value={member.workout_goal} />}
          {member.counselor && <InfoItem label="상담 담당자" value={member.counselor} />}
          <InfoItem label="마일리지" value={`${member.mileage.toLocaleString()}점`} />
          <InfoItem
            label="광고성 수신"
            value={member.marketing_consent ? "동의" : "미동의"}
          />
        </dl>
      )}

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
          <button
            onClick={() => setPassOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
          >
            + 수강권 발급
          </button>
        </div>
        {passes.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            발급된 수강권이 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {passes.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setDetailPassId(p.id)}
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

      <SignedContractsSection memberId={member.id} />

      <BodyMeasurementSection memberId={member.id} onOpen={() => setBodyOpen(true)} />

      <BodyMeasurementModal
        memberId={member.id}
        open={bodyOpen}
        onClose={() => setBodyOpen(false)}
        onDone={() => setBodyOpen(false)}
      />

      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        member={member}
        onSuccess={() => {
          setEditOpen(false);
          load();
        }}
      />
      <PassIssueModal
        open={passOpen}
        onClose={() => setPassOpen(false)}
        memberId={member.id}
        staffList={staffList}
        onSuccess={(passId) => {
          setPassOpen(false);
          setPendingPassId(passId);
          setChoiceOpen(true);
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
        onClose={() => setDetailPassId(null)}
        onRefunded={() => {
          setDetailPassId(null);
          load();
        }}
      />
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-[#A89B80] dark:text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-[#2A251D] dark:text-zinc-100 font-medium break-words">
        {value}
      </dd>
    </div>
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

function EditModal({
  open,
  onClose,
  member,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  member: Member;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email ?? "");
  const [birth, setBirth] = useState(member.birth ?? "");
  const [gender, setGender] = useState<string>(member.gender ?? "");
  const [memo, setMemo] = useState(member.memo ?? "");
  const [address, setAddress] = useState(member.address ?? "");
  const [visitRoute, setVisitRoute] = useState(member.visit_route ?? "");
  const [workoutGoal, setWorkoutGoal] = useState(member.workout_goal ?? "");
  const [counselor, setCounselor] = useState(member.counselor ?? "");
  const [mileage, setMileage] = useState(String(member.mileage ?? 0));
  const [marketingConsent, setMarketingConsent] = useState(!!member.marketing_consent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(member.name);
      setPhone(member.phone);
      setEmail(member.email ?? "");
      setBirth(member.birth ?? "");
      setGender(member.gender ?? "");
      setMemo(member.memo ?? "");
      setAddress(member.address ?? "");
      setVisitRoute(member.visit_route ?? "");
      setWorkoutGoal(member.workout_goal ?? "");
      setCounselor(member.counselor ?? "");
      setMileage(String(member.mileage ?? 0));
      setMarketingConsent(!!member.marketing_consent);
      setError("");
    }
  }, [open, member]);

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("이름을 입력해주세요");
    if (!phone.trim()) return setError("연락처를 입력해주세요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${member.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email,
          birth,
          gender,
          memo,
          address,
          visit_route: visitRoute,
          workout_goal: workoutGoal,
          counselor,
          mileage: Number(mileage) || 0,
          marketing_consent: marketingConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="회원 정보 수정">
      <div className="space-y-3">
        <CrmField label="이름" required>
          <input className={crmInputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </CrmField>
        <CrmField label="연락처" required>
          <input
            className={crmInputClass}
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="010-1234-5678"
          />
        </CrmField>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="성별">
            <select className={crmInputClass} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">선택 안 함</option>
              <option value="M">남</option>
              <option value="F">여</option>
              <option value="N">기타</option>
            </select>
          </CrmField>
          <CrmField label="생년월일">
            <input
              type="date"
              className={crmInputClass}
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </CrmField>
        </div>
        <CrmField label="이메일">
          <input
            type="email"
            className={crmInputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </CrmField>
        <CrmField label="메모">
          <textarea
            className={`${crmInputClass} min-h-[72px]`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </CrmField>
        <CrmField label="주소">
          <input className={crmInputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
        </CrmField>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="방문 경로">
            <input className={crmInputClass} value={visitRoute} onChange={(e) => setVisitRoute(e.target.value)} />
          </CrmField>
          <CrmField label="운동 목적">
            <input className={crmInputClass} value={workoutGoal} onChange={(e) => setWorkoutGoal(e.target.value)} />
          </CrmField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="상담 담당자">
            <input className={crmInputClass} value={counselor} onChange={(e) => setCounselor(e.target.value)} />
          </CrmField>
          <CrmField label="마일리지">
            <input
              type="text"
              inputMode="numeric"
              className={crmInputClass}
              value={mileage}
              onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, ""))}
            />
          </CrmField>
        </div>
        <CrmField label="광고성 수신 동의">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              마케팅·광고성 정보 수신에 동의
            </span>
          </label>
        </CrmField>
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
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

function PassIssueModal({
  open,
  onClose,
  memberId,
  staffList,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  memberId: number;
  staffList: { id: number; display_name: string; role: string; status: string }[];
  onSuccess: (passId: number) => void;
}) {
  const { getIdToken } = useAuth();
  const [issueType, setIssueType] = useState<"new" | "renewal" | "trial" | "service">("new");
  const [lessonKind, setLessonKind] = useState("");
  const [lessonKinds, setLessonKinds] = useState<{ id: number; label: string }[]>([]);
  const [totalSessions, setTotalSessions] = useState(10);
  const [sessionMinutes, setSessionMinutes] = useState(50);
  const [priceWon, setPriceWon] = useState(0);
  const [vatIncluded, setVatIncluded] = useState(false);
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 첫 직원을 기본 강사로 (오픈 시점에 staffList 가 채워져 있다면)
  useEffect(() => {
    if (open && staffList.length > 0 && trainerId === "") {
      setTrainerId(staffList[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffList]);

  // 열릴 때 수업 종류 목록 로드
  useEffect(() => {
    if (!open) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/lesson-kinds", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const kinds = data.kinds ?? [];
        setLessonKinds(kinds);
        if (!lessonKind && kinds.length > 0) setLessonKind(kinds[0].label);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
          seller_member_id: Number(trainerId),
          issue_type: issueType,
          lesson_kind: `${lessonKind}(${totalSessions}회)`,
          total_sessions: totalSessions,
          session_minutes: sessionMinutes,
          price_won: priceWon,
          vat_included: vatIncluded,
          payment_method: paymentMethod,
          payment_method_custom: paymentMethod === "etc" ? paymentCustom : undefined,
          issued_at: issuedAt,
          start_date: startDate,
          expires_at: expiresAt,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "발급 실패");
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
        <CrmField label="수업 종류" required>
          {lessonKinds.length === 0 ? (
            <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 text-[12.5px] text-[#8C8270]">
              등록된 수업 종류가 없어요.{" "}
              <Link
                href="/crm/settings"
                className="text-[#6B7B3A] hover:underline font-medium"
              >
                설정 → 수강권 종류 에서 추가하러 가기 →
              </Link>
            </div>
          ) : (
            <select
              className={crmInputClass}
              value={lessonKind}
              onChange={(e) => setLessonKind(e.target.value)}
            >
              <option value="">선택해 주세요</option>
              {lessonKinds.map((k) => (
                <option key={k.id} value={k.label}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
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
              onChange={(e) => setVatIncluded(e.target.checked)}
              className="w-4 h-4 accent-[#6B7B3A]"
            />
            <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              부가세 포함 금액
            </span>
          </label>
        </CrmField>
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
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] mt-2"
        >
          {submitting ? "발급 중…" : "수강권 발급"}
        </button>
      </div>
    </CrmModal>
  );
}

function PassDetailModal({
  passId,
  staffList,
  onClose,
  onRefunded,
}: {
  passId: number | null;
  staffList: { id: number; display_name: string; role: string; status: string }[];
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
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);

  useEffect(() => {
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

  const open = passId !== null;
  const staffMap = new Map(staffList.map((s) => [s.id, s.display_name]));
  const pass = detail?.pass;
  const trainerName = pass ? staffMap.get(pass.trainer_member_id) ?? "—" : "—";
  const sellerName = pass ? staffMap.get(pass.seller_member_id) ?? "—" : "—";
  const paymentLabel = pass
    ? pass.payment_method === "etc" && pass.payment_method_custom
      ? `${pass.payment_method_custom} (기타)`
      : PAYMENT_METHOD_LABEL[pass.payment_method] ?? pass.payment_method
    : "";

  return (
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

          {pass.memo && (
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
            <button
              onClick={onClose}
              disabled={refunding}
              className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              닫기
            </button>
            {pass.status === "valid" && detail.member && (
              <Link
                href={`/crm/contracts/sign/new?member_id=${detail.member.id}&pass_id=${pass.id}`}
                className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 text-[13.5px] font-semibold text-center hover:bg-amber-50/60"
              >
                전자 계약서
              </Link>
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
            {pass.status === "valid" && (
              <button
                onClick={refund}
                disabled={refunding}
                className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[13.5px] font-semibold hover:bg-red-50 disabled:opacity-60"
              >
                {refunding ? "처리 중…" : "환불 처리"}
              </button>
            )}
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

function BodyMeasurementSection({ memberId, onOpen }: { memberId: number; onOpen: () => void }) {
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

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

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
          신체 측정 기록이 없어요. "+ 측정 기록"으로 추가해 주세요.
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

function SignedContractsSection({ memberId }: { memberId: number }) {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<SignedContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
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
          <Link
            href={`/crm/contracts/sign/new?member_id=${memberId}`}
            className="px-3 py-1.5 rounded-lg border border-[#B47B2A] text-[12.5px] font-semibold text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 hover:bg-amber-50/60"
          >
            + 전자 계약서 작성
          </Link>
        </div>
      </div>

      <RequestLinkModal
        open={requestOpen}
        memberId={memberId}
        onClose={() => setRequestOpen(false)}
        onCreated={() => {
          setRequestOpen(false);
          reload();
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
  onCreated: () => void;
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

  useEffect(() => {
    if (!open) {
      setTemplateId("");
      setLink(null);
      setCopied(false);
      setError("");
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
          setTemplates(data.contracts ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, getIdToken]);

  const generate = async () => {
    setError("");
    if (!templateId) {
      return setError("계약서 양식을 선택해 주세요");
    }
    setCreating(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/contracts/sign/request", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_id: memberId,
          template_id: templateId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "요청 생성 실패");
      setLink(data.url);
      onCreated();
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
                  <Link href="/crm/contracts" className="text-[#6B7B3A] hover:underline font-medium">
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
                onClick={generate}
                disabled={creating}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
              >
                {creating ? "생성 중…" : "요청 링크 생성"}
              </button>
            </div>
          </>
        )}
      </div>
    </CrmModal>
  );
}

function BackLink() {
  return (
    <Link
      href="/crm/members"
      className="inline-flex items-center gap-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A]"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      회원 목록
    </Link>
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
  onClose,
  onDone,
}: {
  open: boolean;
  passId: number | null;
  membershipId: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reason, setReason] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setStartDate(todayStr);
      setEndDate(todayStr);
      setReason("");
      setRequestedBy("");
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
    if (!passId && !membershipId) return setError("대상이 없습니다");
    if (!startDate || !endDate) return setError("시작일과 종료일을 입력해 주세요");
    if (endDate < startDate) return setError("종료일이 시작일보다 빠를 수 없어요");
    if (!requestedBy.trim()) return setError("홀딩 요청자(이름)을 입력해 주세요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/pauses", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          pass_id: passId,
          membership_id: membershipId,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim() || undefined,
          requested_by: requestedBy.trim(),
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
        <CrmField label="홀딩 요청자" required>
          <input
            type="text"
            className={crmInputClass}
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            placeholder="이름 (예: 본인, 가족)"
            maxLength={40}
          />
        </CrmField>
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
