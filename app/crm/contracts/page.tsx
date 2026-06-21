"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { DEFAULT_PT_CONTRACT_TERMS } from "../_components/pt-contract-terms";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";
import { CONTRACT_CATEGORY_LABEL } from "../_components/crm-labels";

type Category = "purchase" | "transfer" | "refund" | "employment" | "etc";
type Sort = "newest" | "oldest" | "name_asc" | "name_desc";
type Tab = "templates" | "signed";

interface Contract {
  id: number;
  category: Category;
  title: string;
  created_by_uid: string;
  created_at: string;
  updated_at: string;
}

interface SignedContract {
  id: number;
  title: string;
  signed_at: string;
  customer_info: { name?: string; phone?: string } | null;
}

const CATEGORY_OPTIONS: { key: Category | ""; label: string }[] = [
  { key: "", label: "전체" },
  { key: "purchase", label: "구매 계약서" },
  { key: "transfer", label: "양도 계약서" },
  { key: "refund", label: "환불 계약서" },
  { key: "employment", label: "근로 계약서" },
  { key: "etc", label: "기타 계약서" },
];

const SORT_OPTIONS: { key: Sort; label: string }[] = [
  { key: "name_asc", label: "이름 오름차순" },
  { key: "name_desc", label: "이름 내림차순" },
  { key: "newest", label: "최근 생성순" },
  { key: "oldest", label: "오래된 순" },
];

export default function CrmContractsPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("signed");
  const [category, setCategory] = useState<Category | "">("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name_asc");
  const [list, setList] = useState<Contract[]>([]);
  const [signedList, setSignedList] = useState<SignedContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      if (tab === "templates") {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (query.trim()) params.set("q", query.trim());
        params.set("sort", sort);
        const res = await fetch(`/api/crm/contracts?${params}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setList(data.contracts ?? []);
      } else {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/crm/contracts/sign?${params}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setSignedList(data.contracts ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, tab, category, query, sort]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            계약서
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            회원·직원과 체결하는 계약서 양식을 카테고리별로 관리해요.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/crm/contracts/sign/new"
            className="px-3 py-2 rounded-lg bg-[#B47B2A] text-white text-[13px] font-semibold hover:bg-[#9c6722] transition-colors whitespace-nowrap"
          >
            전자 계약서 생성
          </Link>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] transition-colors whitespace-nowrap"
          >
            + 새 양식
          </button>
        </div>
      </header>

      {/* 탭 */}
      <div className="flex gap-1.5 mb-3">
        <TabBtn active={tab === "signed"} onClick={() => setTab("signed")}>
          체결 계약서
        </TabBtn>
        <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>
          약관 양식
        </TabBtn>
      </div>

      {/* 카테고리 필터 (양식 탭 전용) */}
      {tab === "templates" && (
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-1 px-1">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c.key || "all"}
            onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors
              ${category === c.key
                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
              }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      )}

      {/* 검색 + 정렬 */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "templates" ? "양식명 검색" : "고객 이름·연락처 검색"}
          className={`${crmInputClass} flex-1 min-w-[160px]`}
        />
        {tab === "templates" && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={crmInputClass}
            style={{ maxWidth: 160 }}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mb-3 text-[12.5px] text-[#8C8270]">
        조회된 목록 {(tab === "templates" ? list : signedList).length}개
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : tab === "templates" ? (
        list.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            {query || category ? "일치하는 양식이 없습니다." : "등록된 양식이 없습니다. 새 양식을 추가해 주세요."}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setDetailId(c.id)}
                  className="w-full text-left px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors h-full"
                >
                  <div className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 break-keep">
                    {c.title}
                  </div>
                  <div className="mt-2 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                    카테고리 : <strong className="text-[#3A342A] dark:text-zinc-300">{CONTRACT_CATEGORY_LABEL[c.category] ?? c.category}</strong>
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500">
                    생성일 : {formatDateTime(c.created_at)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : signedList.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          {query ? "일치하는 계약서가 없습니다." : "체결된 전자 계약서가 없습니다. 위 '전자 계약서 생성' 을 눌러 작성하세요."}
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {signedList.map((c) => (
            <li key={c.id}>
              <Link
                href={`/crm/contracts/signed/${c.id}`}
                className="block w-full text-left px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors h-full"
              >
                <div className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 break-keep">
                  {c.customer_info?.name || "(이름 없음)"}
                </div>
                <div className="mt-1 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                  {c.title}
                </div>
                {c.customer_info?.phone && (
                  <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500">
                    {c.customer_info.phone}
                  </div>
                )}
                <div className="mt-1 text-[11.5px] text-[#A89B80]">
                  서명일 : {formatDateTime(c.signed_at)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          load();
        }}
      />

      <DetailModal
        contractId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => {
          setDetailId(null);
          load();
        }}
      />
    </div>
  );
}

/* ─── 신규 작성 모달 ──────────────────────────── */

function CreateModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("purchase");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setCategory("purchase");
      setBody("");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    setError("");
    if (!title.trim()) return setError("계약서 제목을 입력해주세요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/contracts", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), category, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "작성 실패");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="새 계약서" size="lg">
      <div className="space-y-3">
        <CrmField label="카테고리" required>
          <select
            className={crmInputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {(["purchase", "transfer", "refund", "employment", "etc"] as const).map((k) => (
              <option key={k} value={k}>
                {CONTRACT_CATEGORY_LABEL[k]}
              </option>
            ))}
          </select>
        </CrmField>
        <CrmField label="제목" required>
          <input
            className={crmInputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 피티 회원가입 계약서"
            autoFocus
          />
        </CrmField>
        <CrmField label="내용">
          <textarea
            className={`${crmInputClass} min-h-[240px] font-mono text-[13px]`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="계약 조항을 입력해 주세요."
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() =>
                setBody(
                  DEFAULT_PT_CONTRACT_TERMS.map(
                    (t) => `[${t.title}]\n\n${t.body}`
                  ).join("\n\n\n")
                )
              }
              className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 hover:bg-amber-50/60"
            >
              + PT 기본 약관 5종 가져오기
            </button>
            {DEFAULT_PT_CONTRACT_TERMS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() =>
                  setBody((prev) =>
                    (prev ? prev + "\n\n\n" : "") + `[${t.title}]\n\n${t.body}`
                  )
                }
                className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40"
              >
                + {t.title}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#A89B80]">
            가져온 뒤 센터에 맞게 자유롭게 편집하세요.
          </p>
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

/* ─── 상세/편집 모달 ──────────────────────────── */

function DetailModal({
  contractId,
  onClose,
  onChanged,
}: {
  contractId: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { getIdToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<{
    id: number;
    category: Category;
    title: string;
    body: string;
    created_at: string;
    updated_at: string;
  } | null>(null);

  // 편집 폼 state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("purchase");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (contractId === null) {
      setData(null);
      setEditing(false);
      setError("");
      return;
    }
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getIdToken();
        if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
        const res = await fetch(`/api/crm/contracts/${contractId}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "조회 실패");
        setData(json.contract);
        setTitle(json.contract.title);
        setCategory(json.contract.category);
        setBody(json.contract.body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [contractId, getIdToken]);

  const save = async () => {
    if (!data) return;
    setError("");
    if (!title.trim()) return setError("제목을 입력해주세요");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/contracts/${data.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), category, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "저장 실패");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  const remove = async () => {
    if (!data) return;
    if (!window.confirm("이 계약서 템플릿을 삭제할까요?")) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/contracts/${data.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "삭제 실패");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  return (
    <CrmModal
      open={contractId !== null}
      onClose={onClose}
      title={editing ? "계약서 수정" : "계약서 상세"}
      size="lg"
    >
      {loading ? (
        <div className="text-[13px] text-[#8C8270] py-6 text-center">불러오는 중…</div>
      ) : !data ? (
        <div className="text-[13px] text-red-700 py-6 text-center">{error || "정보를 불러올 수 없습니다."}</div>
      ) : editing ? (
        <div className="space-y-3">
          <CrmField label="카테고리" required>
            <select
              className={crmInputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {(["purchase", "transfer", "refund", "employment", "etc"] as const).map((k) => (
                <option key={k} value={k}>
                  {CONTRACT_CATEGORY_LABEL[k]}
                </option>
              ))}
            </select>
          </CrmField>
          <CrmField label="제목" required>
            <input
              className={crmInputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </CrmField>
          <CrmField label="내용">
            <textarea
              className={`${crmInputClass} min-h-[240px] font-mono text-[13px]`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </CrmField>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setEditing(false);
                setTitle(data.title);
                setCategory(data.category);
                setBody(data.body);
              }}
              className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              취소
            </button>
            <button
              onClick={save}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-[11.5px] text-[#A89B80]">{CONTRACT_CATEGORY_LABEL[data.category] ?? data.category}</div>
            <h2 className="mt-0.5 text-[18px] font-bold text-[#2A251D] dark:text-zinc-100">
              {data.title}
            </h2>
            <div className="mt-1 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
              생성일 {formatDateTime(data.created_at)}
              {data.updated_at !== data.created_at && (
                <span className="ml-2">· 수정 {formatDateTime(data.updated_at)}</span>
              )}
            </div>
          </div>

          <pre className="whitespace-pre-wrap text-[12.5px] text-[#2A251D] dark:text-zinc-200 leading-relaxed px-3.5 py-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/60 max-h-[360px] overflow-y-auto font-sans">
            {data.body || <span className="text-[#A89B80]">본문이 비어있습니다.</span>}
          </pre>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              닫기
            </button>
            <button
              onClick={remove}
              className="px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[13.5px] font-semibold hover:bg-red-50"
            >
              삭제
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
            >
              수정
            </button>
          </div>
        </div>
      )}
    </CrmModal>
  );
}

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    const yyyy = k.getUTCFullYear();
    const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(k.getUTCDate()).padStart(2, "0");
    const hh = String(k.getUTCHours()).padStart(2, "0");
    const mi = String(k.getUTCMinutes()).padStart(2, "0");
    const ss = String(k.getUTCSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return iso;
  }
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors
        ${active
          ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
        }`}
    >
      {children}
    </button>
  );
}
