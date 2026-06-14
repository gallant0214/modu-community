"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import {
  MEMBER_TYPE_LABEL,
  GENDER_LABEL,
  ISSUE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
} from "../../_components/crm-labels";
import { CrmModal, CrmField, crmInputClass } from "../../_components/crm-modal";

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
}

export default function CrmMemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = Number(params.id);
  const { getIdToken } = useAuth();

  const [member, setMember] = useState<Member | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);

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
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-3xl mx-auto">
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
            {member.phone}
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
              <li key={p.id} className="px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                    {p.lesson_kind}
                  </span>
                  <PassStatusChip status={p.status} />
                </div>
                <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
                  {ISSUE_TYPE_LABEL[p.issue_type] ?? p.issue_type} ·{" "}
                  잔여 {p.remaining_sessions}/{p.total_sessions}회 ·{" "}
                  {p.session_minutes}분 · {p.price_won.toLocaleString()}원 ·{" "}
                  {p.payment_method === "custom" && p.payment_method_custom
                    ? p.payment_method_custom
                    : PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#A89B80]">
                  발급 {p.issued_at} · 만료 {p.expires_at}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
        onSuccess={() => {
          setPassOpen(false);
          load();
        }}
      />
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
          <input className={crmInputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
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
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  memberId: number;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [issueType, setIssueType] = useState<"new" | "renewal" | "trial" | "service">("new");
  const [lessonKind, setLessonKind] = useState("개인PT");
  const [totalSessions, setTotalSessions] = useState(10);
  const [sessionMinutes, setSessionMinutes] = useState(50);
  const [priceWon, setPriceWon] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "custom" | "etc">("card");
  const [paymentCustom, setPaymentCustom] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [memo, setMemo] = useState("");
  const [trainerId, setTrainerId] = useState<number | "">("");
  const [staffList, setStaffList] = useState<{ id: number; display_name: string; role: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 직원 목록 로드 (강사 선택용)
  useEffect(() => {
    if (!open) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/staff", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const active = (data.staff ?? []).filter(
          (s: { status: string }) => s.status === "active"
        );
        setStaffList(active);
        if (active.length > 0 && trainerId === "") setTrainerId(active[0].id);
      }
    })();
  // trainerId 가 ""일 때만 자동 선택, 무한 루프 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, getIdToken]);

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
          payment_method: paymentMethod,
          payment_method_custom: paymentMethod === "custom" ? paymentCustom : undefined,
          issued_at: issuedAt,
          expires_at: expiresAt,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "발급 실패");
      onSuccess();
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
          <input
            className={crmInputClass}
            value={lessonKind}
            onChange={(e) => setLessonKind(e.target.value)}
            placeholder="예) 개인PT, 그룹PT"
          />
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
            type="number"
            min={0}
            step={10000}
            className={crmInputClass}
            value={priceWon}
            onChange={(e) => setPriceWon(Number(e.target.value) || 0)}
          />
        </CrmField>
        <CrmField label="결제 수단">
          <div className="grid grid-cols-5 gap-1.5">
            {(["cash", "card", "transfer", "custom", "etc"] as const).map((m) => (
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
          {paymentMethod === "custom" && (
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
          <CrmField label="만료일" required>
            <input
              type="date"
              className={crmInputClass}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </CrmField>
        </div>
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
