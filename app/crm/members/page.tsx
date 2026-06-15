"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { MEMBER_TYPE_LABEL, GENDER_LABEL } from "../_components/crm-labels";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";

interface MemberRow {
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

export default function CrmMembersPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const url = `/api/crm/members${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, query]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            회원 관리
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            가회원·정회원·매칭회원을 등록하고 수강권을 발급해요.
          </p>
        </div>
        <button
          onClick={() => setRegisterOpen(true)}
          className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] transition-colors whitespace-nowrap"
        >
          + 회원 등록
        </button>
      </header>

      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 연락처 검색"
          className={crmInputClass}
        />
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <ListMsg>불러오는 중…</ListMsg>
      ) : list.length === 0 ? (
        <ListMsg>{query ? "일치하는 회원이 없습니다." : "등록된 회원이 없습니다."}</ListMsg>
      ) : (
        <MembersTable rows={list} />
      )}

      <RegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSuccess={() => {
          setRegisterOpen(false);
          load();
        }}
      />
    </div>
  );
}

function MembersTable({ rows }: { rows: MemberRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
      <table className="w-full text-[13.5px]">
        <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
          <tr>
            <Th>이름</Th>
            <Th>유형</Th>
            <Th>연락처</Th>
            <Th>성별/생년</Th>
            <Th>등록일</Th>
            <Th className="text-right pr-4">상세</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
              <Td>
                <span className="font-semibold text-[#2A251D] dark:text-zinc-100">{m.name}</span>
              </Td>
              <Td>{MEMBER_TYPE_LABEL[m.member_type] ?? m.member_type}</Td>
              <Td className="text-[#6B5D47] dark:text-zinc-400">{m.phone}</Td>
              <Td className="text-[#8C8270] dark:text-zinc-500">
                {[m.gender ? GENDER_LABEL[m.gender] : null, m.birth].filter(Boolean).join(" / ") || "—"}
              </Td>
              <Td className="text-[#8C8270] dark:text-zinc-500">{formatDate(m.created_at)}</Td>
              <Td className="text-right pr-4">
                <Link
                  href={`/crm/members/${m.id}`}
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
  );
}

function RegisterModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [memberType, setMemberType] = useState<"provisional" | "full" | "matched">("provisional");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<"" | "M" | "F" | "N">("");
  const [linkedUid, setLinkedUid] = useState("");
  const [linkedNickname, setLinkedNickname] = useState("");
  const [nickQuery, setNickQuery] = useState("");
  const [nickResults, setNickResults] = useState<
    { firebase_uid: string; name: string; email: string | null }[]
  >([]);
  const [nickSearching, setNickSearching] = useState(false);
  const [nickSearched, setNickSearched] = useState(false);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setMemberType("provisional");
      setName("");
      setPhone("");
      setEmail("");
      setBirth("");
      setGender("");
      setLinkedUid("");
      setLinkedNickname("");
      setNickQuery("");
      setNickResults([]);
      setNickSearched(false);
      setMemo("");
      setError("");
    }
  }, [open]);

  // 회원 유형이 가회원으로 바뀌면 연결 정보 초기화
  useEffect(() => {
    if (memberType === "provisional") {
      setLinkedUid("");
      setLinkedNickname("");
      setNickQuery("");
      setNickResults([]);
      setNickSearched(false);
    }
  }, [memberType]);

  const searchNickname = async () => {
    const q = nickQuery.trim();
    setError("");
    if (!q) {
      setNickResults([]);
      setNickSearched(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      setNickSearching(true);
      const res = await fetch(`/api/crm/users/lookup?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "검색 실패");
      setNickResults(data.users ?? []);
      setNickSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setNickSearching(false);
    }
  };

  const pickUser = (u: { firebase_uid: string; name: string; email: string | null }) => {
    setLinkedUid(u.firebase_uid);
    setLinkedNickname(u.name);
    // 이름이 비어있으면 닉네임을 기본값으로 자동 입력
    if (!name.trim()) setName(u.name);
    // 이메일이 비어있으면 가입자의 이메일을 자동 입력
    if (!email.trim() && u.email) setEmail(u.email);
    setNickResults([]);
    setNickSearched(false);
    setNickQuery("");
  };

  const clearLinked = () => {
    setLinkedUid("");
    setLinkedNickname("");
  };

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("이름을 입력해주세요");
    if (!phone.trim()) return setError("연락처를 입력해주세요");
    if ((memberType === "matched" || memberType === "full") && !linkedUid.trim()) {
      return setError("모두의 지도사 사용자를 닉네임으로 검색해 선택해 주세요");
    }
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/members", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_type: memberType,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          birth: birth || undefined,
          gender: gender || undefined,
          linked_firebase_uid: linkedUid.trim() || undefined,
          memo: memo.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "등록 실패");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="회원 등록">
      <div className="space-y-3">
        <CrmField label="회원 유형" required>
          <div className="grid grid-cols-3 gap-2">
            {(["provisional", "full", "matched"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMemberType(t)}
                className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors
                  ${memberType === t
                    ? "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {MEMBER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
            {memberType === "provisional" && "이름·연락처만으로 미리 등록. 나중에 회원이 가입하면 매칭으로 전환할 수 있어요."}
            {memberType === "full" && "관리자가 가입을 대행해요. 사용자 식별자(uid)가 필요해요."}
            {memberType === "matched" && "이미 모두의 지도사를 사용하는 분과 매칭. uid가 필요해요."}
          </p>
        </CrmField>

        <CrmField label="이름" required>
          <input className={crmInputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </CrmField>
        <CrmField label="연락처" required>
          <input
            className={crmInputClass}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
          />
        </CrmField>
        <div className="grid grid-cols-2 gap-2">
          <CrmField label="성별">
            <select
              className={crmInputClass}
              value={gender}
              onChange={(e) => setGender(e.target.value as "" | "M" | "F" | "N")}
            >
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
            className={crmInputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </CrmField>

        {(memberType === "matched" || memberType === "full") && (
          <CrmField label="모두의 지도사 사용자 연결" required>
            {linkedUid ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/15">
                <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-200">
                  연결됨: <strong className="font-semibold">{linkedNickname}</strong>
                </span>
                <button
                  onClick={clearLinked}
                  className="text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
                >
                  다시 선택
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    className={`${crmInputClass} flex-1`}
                    value={nickQuery}
                    onChange={(e) => setNickQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchNickname();
                      }
                    }}
                    placeholder="닉네임 또는 이메일"
                  />
                  <button
                    type="button"
                    onClick={searchNickname}
                    disabled={nickSearching || !nickQuery.trim()}
                    className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
                  >
                    {nickSearching ? "검색 중…" : "검색"}
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
                  닉네임은 일부만 입력해도 검색되고, 이메일은 정확히 입력하면 바로 찾을 수 있어요.
                </p>
                {nickSearched && nickResults.length === 0 && (
                  <div className="mt-2 px-3 py-2 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                    일치하는 사용자가 없습니다.
                  </div>
                )}
                {nickResults.length > 0 && (
                  <ul className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
                    {nickResults.map((u) => (
                      <li key={u.firebase_uid}>
                        <button
                          type="button"
                          onClick={() => pickUser(u)}
                          className="w-full text-left px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50"
                        >
                          <div className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100">
                            {u.name}
                          </div>
                          {u.email && (
                            <div className="text-[11.5px] text-[#A89B80] truncate">
                              {u.email}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CrmField>
        )}
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
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] transition-colors mt-2"
        >
          {submitting ? "등록 중…" : "등록"}
        </button>
      </div>
    </CrmModal>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2.5 ${className || ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 ${className || ""}`}>{children}</td>;
}
function ListMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
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
