"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import {
  ROLE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  formatPhone,
} from "../_components/crm-labels";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";

interface StaffRow {
  id: number;
  firebase_uid: string;
  role: string;
  grade_label: string | null;
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

export default function CrmStaffPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/staff", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.staff ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const active = list.filter((s) => s.status === "active");
  const inactive = list.filter((s) => s.status !== "active");

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            직원 관리
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            가입한 직원의 등급과 권한을 관리해요.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] transition-colors whitespace-nowrap"
        >
          + 직원 추가
        </button>
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <ListMessage>불러오는 중…</ListMessage>
      ) : (
        <>
          <StaffTable rows={active} label="재직 중" />
          {inactive.length > 0 && (
            <div className="mt-8">
              <StaffTable rows={inactive} label="퇴사" muted />
            </div>
          )}
        </>
      )}

      <Hint>
        강사가 직접 가입하려면 onboarding에서 센터를 검색해 가입할 수 있어요. 가입 직후엔 권한이 없으니 여기서 등급과 권한을 조정해 주세요.
      </Hint>

      <AddStaffModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false);
          load();
        }}
      />
    </div>
  );
}

interface LookupUser {
  firebase_uid: string;
  name: string;
  email: string | null;
  existing: { status: string; role: string } | null;
}

function AddStaffModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [mode, setMode] = useState<"search" | "direct">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [picked, setPicked] = useState<LookupUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [gradeId, setGradeId] = useState<number | "">("");
  const [accessLevel, setAccessLevel] = useState<"none" | "schedule" | "admin">("schedule");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState<"working" | "on_leave" | "resigned">("working");
  const [employmentType, setEmploymentType] = useState<"" | "regular" | "freelance" | "part_time">("");

  const [grades, setGrades] = useState<{ id: number; base_role: string; label: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 등급 목록 로드
  useEffect(() => {
    if (!open) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/grades", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.grades ?? [];
        setGrades(list);
        // 기본 선택: '강사' 기반 첫 등급
        const trainerGrade = list.find((g: { base_role: string }) => g.base_role === "trainer");
        if (trainerGrade && gradeId === "") setGradeId(trainerGrade.id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, getIdToken]);

  useEffect(() => {
    if (!open) {
      setMode("search");
      setQuery("");
      setResults([]);
      setSearched(false);
      setPicked(null);
      setDisplayName("");
      setGradeId("");
      setAccessLevel("schedule");
      setEmail("");
      setPhone("");
      setAddress("");
      setEmploymentStatus("working");
      setEmploymentType("");
      setError("");
    }
  }, [open]);

  const selectedGrade = grades.find((g) => g.id === gradeId);
  const role = (selectedGrade?.base_role ?? "trainer") as "owner" | "admin" | "manager" | "trainer";

  const search = async () => {
    const q = query.trim();
    setError("");
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      setSearching(true);
      const res = await fetch(`/api/crm/staff/lookup?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "검색 실패");
      setResults(data.users ?? []);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSearching(false);
    }
  };

  const pick = (u: LookupUser) => {
    if (u.existing && u.existing.status === "active") {
      setError("이미 등록된 직원입니다");
      return;
    }
    setPicked(u);
    setDisplayName(u.name);
    // 이메일 입력란이 비어있으면 가입자의 이메일을 자동 입력
    if (!email.trim() && u.email) setEmail(u.email);
    setError("");
  };

  const submit = async () => {
    setError("");
    if (mode === "search" && !picked) return;
    if (!displayName.trim()) return setError("이름(표시명)을 입력해주세요");
    if (!gradeId) return setError("등급을 선택해주세요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/staff", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          ...(mode === "direct"
            ? { direct: true }
            : { firebase_uid: picked!.firebase_uid }),
          display_name: displayName.trim(),
          grade_id: gradeId,
          access_level: accessLevel,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          employment_status: employmentStatus,
          employment_type: employmentType || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="직원 추가" size="lg">
      {/* 등록 방식 토글 */}
      <div className="mb-4 inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
        {(["search", "direct"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setPicked(null);
              setError("");
              if (m === "direct") setDisplayName("");
            }}
            className={`px-4 py-2 text-[13px] font-semibold ${
              mode === m
                ? "bg-[#6B7B3A] text-white"
                : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300"
            }`}
          >
            {m === "search" ? "사용자 검색" : "회원가입 없이 직접 등록"}
          </button>
        ))}
      </div>

      {mode === "search" && !picked ? (
        <>
          <CrmField label="사용자 검색">
            <div className="flex gap-2">
              <input
                className={`${crmInputClass} flex-1`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") search();
                }}
                placeholder="닉네임 또는 이메일"
                autoFocus
              />
              <button
                onClick={search}
                disabled={searching || !query.trim()}
                className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
              >
                {searching ? "검색 중…" : "검색"}
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
              닉네임은 일부만 입력해도 검색되고, 이메일은 정확히 입력하면 바로 찾을 수 있어요.
            </p>
          </CrmField>

          <div className="mt-4">
            {searched && results.length === 0 && (
              <ListMsg>일치하는 사용자가 없습니다. 닉네임이나 이메일을 확인해 주세요.</ListMsg>
            )}
            {results.length > 0 && (
              <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {results.map((u) => {
                  const blocked = u.existing && u.existing.status === "active";
                  return (
                    <li key={u.firebase_uid}>
                      <button
                        onClick={() => pick(u)}
                        disabled={!!blocked}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-[13.5px] flex items-start justify-between gap-3
                          ${blocked
                            ? "border-[#E8E0D0]/40 bg-[#F5F0E5] dark:bg-zinc-800/30 text-[#A89B80] cursor-not-allowed"
                            : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50"
                          }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[#2A251D] dark:text-zinc-100 truncate">
                            {u.name}
                          </div>
                          {u.email && (
                            <div className="text-[11.5px] text-[#A89B80] truncate mt-0.5">
                              {u.email}
                            </div>
                          )}
                        </div>
                        <span className="text-[11.5px] text-[#A89B80] truncate shrink-0 mt-0.5">
                          {blocked
                            ? `이미 ${ROLE_LABEL[u.existing!.role] ?? u.existing!.role}으로 등록됨`
                            : u.existing?.status === "inactive"
                            ? "퇴사 처리됨 — 재등록 가능"
                            : "추가 가능"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </>
      ) : (
        <>
          {mode === "search" && picked ? (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#3A342A] dark:text-zinc-300">
              <strong>{picked.name}</strong> 님을 직원으로 추가합니다.
              <button
                onClick={() => setPicked(null)}
                className="ml-2 text-[#6B7B3A] hover:underline"
              >
                다시 선택
              </button>
            </div>
          ) : (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              앱 회원가입 없이 직원을 직접 등록해요. 나중에 본인이 커뮤니티에 가입하면 별도로 연동할 수 있어요.
            </div>
          )}

          <div className="space-y-3">
            <CrmField label="이름 (센터 표시명)" required>
              <input
                className={crmInputClass}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="실명을 입력해 주세요"
                autoFocus={mode === "direct"}
              />
              <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
                센터 안에서만 보이는 이름이에요. 실명으로 입력하세요.
              </p>
            </CrmField>

            <div className="grid grid-cols-2 gap-3">
              <CrmField label="등급" required>
                <select
                  className={crmInputClass}
                  value={gradeId}
                  onChange={(e) => setGradeId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">선택해 주세요</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </CrmField>
              <CrmField label="접근 권한" required>
                <select
                  className={crmInputClass}
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as typeof accessLevel)}
                  disabled={role === "owner"}
                >
                  <option value="none">강사</option>
                  <option value="schedule">스케줄</option>
                  <option value="admin">관리자</option>
                </select>
              </CrmField>
            </div>
            <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
              {role === "owner" && "대표자는 자동으로 관리자 권한을 가져요."}
              {role === "admin" && "관리자는 디폴트로 모든 데이터를 볼 수 있어요. 강사 권한으로 두면 본인 데이터 위주로만 보입니다."}
              {role === "manager" && "팀장은 본인 팀의 매출과 회원을 볼 수 있어요. 강사 권한으로 두면 본인 것만 보여요."}
              {role === "trainer" && "강사는 본인 데이터만 볼 수 있어요. 스케줄을 선택하면 본인 수업 일정만 조회·관리할 수 있어요."}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <CrmField label="이메일">
                <input
                  type="email"
                  className={crmInputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </CrmField>
              <CrmField label="연락처">
                <input
                  type="tel"
                  inputMode="numeric"
                  className={crmInputClass}
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="010-1234-5678"
                />
              </CrmField>
            </div>

            <CrmField label="주소">
              <input
                type="text"
                className={crmInputClass}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 강남구 강남대로 1길 1-11"
              />
            </CrmField>

            <div className="grid grid-cols-2 gap-3">
              <CrmField label="재직상태">
                <select
                  className={crmInputClass}
                  value={employmentStatus}
                  onChange={(e) => setEmploymentStatus(e.target.value as typeof employmentStatus)}
                >
                  <option value="working">재직중</option>
                  <option value="on_leave">휴직</option>
                  <option value="resigned">퇴사</option>
                </select>
              </CrmField>
              <CrmField label="근무형태">
                <select
                  className={crmInputClass}
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}
                >
                  <option value="">선택 안 함</option>
                  <option value="regular">정규직</option>
                  <option value="freelance">프리랜서</option>
                  <option value="part_time">아르바이트</option>
                </select>
              </CrmField>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932]"
            >
              {submitting ? "추가 중…" : "직원으로 추가"}
            </button>
          </div>
        </>
      )}
    </CrmModal>
  );
}

function ListMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}

function StaffTable({ rows, label, muted }: { rows: StaffRow[]; label: string; muted?: boolean }) {
  if (rows.length === 0) {
    return <ListMessage>{label}인 직원이 없습니다.</ListMessage>;
  }
  return (
    <div>
      <div className="text-[12px] font-medium text-[#A89B80] dark:text-zinc-500 mb-2">
        {label} ({rows.length}명)
      </div>
      <div className={`overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 ${muted ? "opacity-70" : ""}`}>
        <table className="w-full text-[13.5px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>이름</Th>
              <Th>등급</Th>
              <Th>연락처</Th>
              <Th>주소</Th>
              <Th>재직상태</Th>
              <Th>근무형태</Th>
              <Th>이메일</Th>
              <Th>가입일</Th>
              <Th className="text-right pr-4">관리</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                <Td>
                  <Link
                    href={`/crm/staff/${s.id}`}
                    className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A] dark:hover:text-[#A8B87A] hover:underline"
                  >
                    {s.display_name}
                  </Link>
                  {s.is_solo_owner && (
                    <span className="ml-1.5 text-[11px] text-[#A89B80]">· 본인</span>
                  )}
                </Td>
                <Td className="font-medium text-[#3A342A] dark:text-zinc-300">
                  {s.grade_label ?? ROLE_LABEL[s.role] ?? s.role}
                </Td>
                <Td className="text-[#6B5D47] dark:text-zinc-400">{s.phone ? formatPhone(s.phone) : "—"}</Td>
                <Td className="text-[#6B5D47] dark:text-zinc-400">
                  <span className="block max-w-[220px] truncate" title={s.address || ""}>
                    {s.address || "—"}
                  </span>
                </Td>
                <Td>
                  <EmploymentStatusChip status={s.employment_status} />
                </Td>
                <Td className="text-[#6B5D47] dark:text-zinc-400">
                  {s.employment_type ? EMPLOYMENT_TYPE_LABEL[s.employment_type] ?? s.employment_type : "—"}
                </Td>
                <Td className="text-[#8C8270] dark:text-zinc-500">{s.email || "—"}</Td>
                <Td className="text-[#8C8270] dark:text-zinc-500">{formatDate(s.joined_at)}</Td>
                <Td className="text-right pr-4">
                  <Link
                    href={`/crm/staff/${s.id}`}
                    className="inline-flex items-center px-2.5 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[#6B7B3A] dark:text-[#A8B87A] text-[12px] font-medium hover:bg-[#6B7B3A]/5"
                  >
                    상세
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left font-medium px-3 py-2.5 ${className || ""}`}>{children}</th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 ${className || ""}`}>{children}</td>;
}
function ListMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
      <strong className="font-semibold text-[#3A342A] dark:text-zinc-300">팁</strong>
      <span className="mx-1.5">·</span>
      {children}
    </div>
  );
}
function EmploymentStatusChip({ status }: { status: string }) {
  const label = EMPLOYMENT_STATUS_LABEL[status] ?? status;
  const cls =
    status === "working"
      ? "bg-[#EFE7D5] text-[#6B7B3A] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A]"
      : status === "on_leave"
      ? "bg-[#F5E4C8] text-[#B47B2A] dark:bg-amber-950/40 dark:text-amber-300"
      : "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
