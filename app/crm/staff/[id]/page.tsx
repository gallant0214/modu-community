"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import {
  ROLE_LABEL,
  ACCESS_LEVEL_LABEL,
  ATTENDANCE_MODE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  formatPhone,
} from "../../_components/crm-labels";
import { crmInputClass } from "../../_components/crm-modal";

interface StaffMember {
  id: number;
  firebase_uid: string;
  role: string;
  grade_id: number | null;
  display_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  employment_status: string;
  employment_type: string | null;
  access_level: string;
  is_solo_owner: boolean;
  status: string;
  joined_at: string;
  left_at: string | null;
}

interface Grade {
  id: number;
  base_role: string;
  label: string;
  is_system: boolean;
}

interface Permissions {
  center_member_id: number;
  can_create_reservation: boolean;
  can_modify_reservation: boolean;
  can_cancel_reservation: boolean;
  attendance_mode: string;
  can_cancel_attendance: boolean;
  can_issue_pass: boolean;
  can_manage_all_schedules: boolean;
}

export default function CrmStaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = Number(params.id);
  const { getIdToken } = useAuth();

  const [member, setMember] = useState<StaffMember | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/staff/${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setMember(data.member);
      setPerms(data.permissions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId]);

  useEffect(() => {
    if (memberId) load();
  }, [memberId, load]);

  // 등급 목록 1회 로드
  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/grades", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGrades(data.grades ?? []);
      }
    })();
  }, [getIdToken]);

  const patchMember = async (body: Record<string, unknown>) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/staff/${memberId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const patchPerms = async (body: Record<string, unknown>) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/staff/${memberId}/permissions`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-6">
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      </div>
    );
  }
  if (!member) {
    return (
      <div className="px-5 md:px-8 py-6">
        <BackLink />
        <div className="mt-4 text-[14px] text-[#6B5D47]">
          {error || "직원을 찾을 수 없습니다."}
        </div>
      </div>
    );
  }

  const isTrainerLike = member.role === "trainer" || member.role === "manager";
  const isSelfNotOwner = member.is_solo_owner;

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <BackLink />

      <header className="mt-3 mb-5">
        <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          {member.display_name}
          {isSelfNotOwner && (
            <span className="ml-2 text-[12px] text-[#A89B80]">· 본인</span>
          )}
        </h1>
      </header>

      <ContactSection
        phone={member.phone}
        email={member.email}
        address={member.address}
        saving={saving}
        onSave={(p) => patchMember(p)}
      />

      <Section title="인사 정보">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12.5px] text-[#A89B80] mb-1.5">재직상태</div>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 disabled:opacity-60"
              value={member.employment_status}
              disabled={saving}
              onChange={(e) => patchMember({ employment_status: e.target.value })}
            >
              {Object.entries(EMPLOYMENT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[12.5px] text-[#A89B80] mb-1.5">근무형태</div>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 disabled:opacity-60"
              value={member.employment_type ?? ""}
              disabled={saving}
              onChange={(e) => patchMember({ employment_type: e.target.value || null })}
            >
              <option value="">선택 안 함</option>
              {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <DisplayNameSection
        currentName={member.display_name}
        saving={saving}
        onSave={(name) => patchMember({ display_name: name })}
      />

      <Section title="등급">
        <select
          className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A] disabled:opacity-60"
          value={member.grade_id ?? ""}
          disabled={saving || member.is_solo_owner}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            if (id) patchMember({ grade_id: id });
          }}
        >
          <option value="">선택해 주세요</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label} {g.is_system ? "" : "· 커스텀"}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[12px] text-[#A89B80] leading-relaxed">
          현재 등급:{" "}
          <strong className="text-[#3A342A] dark:text-zinc-200">
            {grades.find((g) => g.id === member.grade_id)?.label ?? ROLE_LABEL[member.role] ?? member.role}
          </strong>
          {" "}(권한 분류: {ROLE_LABEL[member.role] ?? member.role}).{" "}
          새 등급을 만들려면 설정 → 등급 관리에서 추가하세요.
        </p>
        {member.is_solo_owner && (
          <p className="mt-1 text-[12px] text-[#A89B80]">
            본인(개인 강사) 등급은 변경할 수 없어요.
          </p>
        )}
      </Section>

      <Section title="접근 권한">
        <div className="grid grid-cols-3 gap-2">
          {(["none", "schedule", "admin"] as const).map((al) => (
            <SegBtn
              key={al}
              selected={member.access_level === al || (member.role === "owner" && al === "admin")}
              disabled={saving || member.role === "owner"}
              onClick={() => patchMember({ access_level: al })}
            >
              {ACCESS_LEVEL_LABEL[al]}
            </SegBtn>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[#A89B80] leading-relaxed">
          대표자는 항상 관리자 권한이에요. 새로 가입한 강사는 기본 "강사" 권한이라 본인 데이터 위주로 보여요. 스케줄/관리자로 올리면 권한 범위가 확장돼요.
        </p>
      </Section>

      {isTrainerLike && (
        <Section title="기능 권한 (강사·팀장)">
          <PermsGrid perms={perms} onToggle={patchPerms} disabled={saving} />
        </Section>
      )}

      <Section title="재직 상태">
        <div className="flex gap-2">
          <SegBtn
            selected={member.status === "active"}
            disabled={saving || member.is_solo_owner}
            onClick={() => patchMember({ status: "active" })}
          >
            재직
          </SegBtn>
          <SegBtn
            selected={member.status === "inactive"}
            disabled={saving || member.is_solo_owner}
            onClick={() => {
              if (confirm("이 직원을 퇴사 처리할까요? CRM 접근이 차단됩니다.")) {
                patchMember({ status: "inactive" }).then(() => router.push("/crm/staff"));
              }
            }}
            danger
          >
            퇴사 처리
          </SegBtn>
        </div>
      </Section>
    </div>
  );
}

function PermsGrid({
  perms,
  onToggle,
  disabled,
}: {
  perms: Permissions | null;
  onToggle: (body: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const items: { key: keyof Permissions; label: string; hint?: string }[] = [
    { key: "can_create_reservation", label: "예약 생성" },
    { key: "can_modify_reservation", label: "예약 변경" },
    { key: "can_cancel_reservation", label: "예약 취소" },
    { key: "can_cancel_attendance", label: "출석 취소" },
    { key: "can_issue_pass", label: "수강권 발급" },
    {
      key: "can_manage_all_schedules",
      label: "타 강사 스케줄 관리",
      hint: "본인 외 강사의 예약·개인일정도 만들고 수정·삭제 가능",
    },
  ];
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <ToggleRow
          key={String(it.key)}
          label={it.label}
          hint={it.hint}
          on={!!perms?.[it.key]}
          disabled={disabled}
          onChange={(v) => onToggle({ [it.key]: v })}
        />
      ))}
      <div className="pt-2 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-2">
          출석 확인 권한
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["trainer", "owner_only"] as const).map((m) => (
            <SegBtn
              key={m}
              selected={perms?.attendance_mode === m}
              disabled={disabled}
              onClick={() => onToggle({ attendance_mode: m })}
            >
              {ATTENDANCE_MODE_LABEL[m]}
            </SegBtn>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SegBtn({
  selected,
  disabled,
  onClick,
  danger,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50
        ${selected
          ? danger
            ? "border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
            : "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A] dark:bg-[#6B7B3A]/20"
          : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
        }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between py-1.5 gap-3">
      <div className="min-w-0">
        <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-300">{label}</span>
        {hint && (
          <p className="mt-0.5 text-[11.5px] text-[#A89B80] dark:text-zinc-500 leading-tight">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        disabled={disabled}
        className={`shrink-0 relative inline-flex w-10 h-6 rounded-full transition-colors disabled:opacity-50 mt-0.5
          ${on ? "bg-[#6B7B3A]" : "bg-[#E8E0D0] dark:bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform
            ${on ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}

function DisplayNameSection({
  currentName,
  saving,
  onSave,
}: {
  currentName: string;
  saving: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const changed = name.trim() !== currentName && name.trim().length > 0;

  return (
    <section className="mb-6 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-1">
        센터 표시명
      </h2>
      <p className="text-[12px] text-[#A89B80] mb-3 leading-relaxed">
        센터 안에서만 보이는 이름이에요. 모두의 지도사 커뮤니티 닉네임은 그대로 유지돼요.
      </p>
      <div className="flex gap-2">
        <input
          className={`${crmInputClass} flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="실명을 입력해 주세요"
        />
        <button
          onClick={() => onSave(name.trim())}
          disabled={saving || !changed}
          className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-40 text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </section>
  );
}

function ContactSection({
  phone,
  email,
  address,
  saving,
  onSave,
}: {
  phone: string | null;
  email: string | null;
  address: string | null;
  saving: boolean;
  onSave: (patch: { phone?: string | null; email?: string | null; address?: string | null }) => void;
}) {
  const [p, setP] = useState(phone ?? "");
  const [e, setE] = useState(email ?? "");
  const [a, setA] = useState(address ?? "");

  useEffect(() => {
    setP(phone ?? "");
    setE(email ?? "");
    setA(address ?? "");
  }, [phone, email, address]);

  const dirtyPhone = p !== (phone ?? "");
  const dirtyEmail = e !== (email ?? "");
  const dirtyAddress = a !== (address ?? "");
  const dirty = dirtyPhone || dirtyEmail || dirtyAddress;

  const save = () => {
    const patch: { phone?: string | null; email?: string | null; address?: string | null } = {};
    if (dirtyPhone) patch.phone = p.trim() || null;
    if (dirtyEmail) patch.email = e.trim() || null;
    if (dirtyAddress) patch.address = a.trim() || null;
    onSave(patch);
  };

  return (
    <section className="mb-6 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        연락처 / 이메일 / 주소
      </h2>
      <div className="space-y-3">
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">연락처</div>
          <input
            type="tel"
            inputMode="numeric"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]"
            value={p}
            onChange={(ev) => setP(formatPhone(ev.target.value))}
            placeholder="010-1234-5678"
          />
        </div>
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">이메일</div>
          <input
            type="email"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]"
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            placeholder="example@email.com"
          />
        </div>
        <div>
          <div className="text-[12.5px] text-[#A89B80] mb-1.5">주소</div>
          <input
            type="text"
            className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]"
            value={a}
            onChange={(ev) => setA(ev.target.value)}
            placeholder="예: 강남구 강남대로 1길 1-11"
          />
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="w-full px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-40 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/crm/staff"
      className="inline-flex items-center gap-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A] dark:hover:text-zinc-200"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      직원 목록
    </Link>
  );
}
