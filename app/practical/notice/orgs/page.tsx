"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import DisclaimerBanner from "@/app/components/disclaimer-banner";

interface Org {
  id: number;
  sport_name: string;
  org_name: string;
  phone: string | null;
  zipcode: string | null;
  address: string | null;
  website: string | null;
}

export default function OrgsPage() {
  const [audience, setAudience] = useState<"main" | "disabled">("main");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/practical-oral-notice/orgs?audience=${audience}`)
      .then((r) => r.json())
      .then((d) => setOrgs(d.orgs || []))
      .finally(() => setLoading(false));
  }, [audience]);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return orgs;
    return orgs.filter(
      (o) =>
        o.sport_name.toLowerCase().includes(k) ||
        o.org_name.toLowerCase().includes(k)
    );
  }, [q, orgs]);

  const backHref = `/practical/notice${audience === "disabled" ? "?audience=disabled" : ""}`;

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href={backHref} className="text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:underline">
          ← 공지 목록
        </Link>
        <h1 className="text-2xl font-bold mt-1 mb-1 text-[#2A251D] dark:text-zinc-100">
          🏢 종목별 주관단체 연락처
        </h1>
        <p className="text-[13px] text-[#A89B80] mb-3">{filtered.length}개 종목</p>

        <DisclaimerBanner />

        {/* audience 토글 */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setAudience("main")} className={tabCls(audience === "main")}>일반</button>
          <button onClick={() => setAudience("disabled")} className={tabCls(audience === "disabled")}>장애인</button>
        </div>

        {/* 검색 */}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="종목명 또는 단체명 검색 (예: 보디빌딩)"
          className="w-full px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[14px] mb-3"
        />

        {loading ? (
          <p className="text-center py-8 text-[#A89B80]">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-8 text-[#A89B80]">검색 결과가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => (
              <div key={o.id} className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl p-4">
                <div className="flex items-start gap-3 mb-2">
                  <h3 className="font-bold text-[#2A251D] dark:text-zinc-100">{o.sport_name}</h3>
                  <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">{o.org_name}</span>
                </div>
                <dl className="text-[12.5px] space-y-0.5 text-[#3A342A] dark:text-zinc-300">
                  {o.phone && (
                    <div className="flex gap-2"><dt className="text-[#A89B80] w-12 shrink-0">전화</dt><dd>{o.phone}</dd></div>
                  )}
                  {o.address && (
                    <div className="flex gap-2"><dt className="text-[#A89B80] w-12 shrink-0">주소</dt><dd>{[o.zipcode, o.address].filter(Boolean).join(" ")}</dd></div>
                  )}
                  {o.website && (
                    <div className="flex gap-2">
                      <dt className="text-[#A89B80] w-12 shrink-0">홈피</dt>
                      <dd>
                        <a
                          href={o.website.startsWith("http") ? o.website : `https://${o.website}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[#6B7B3A] dark:text-[#A8B87A] hover:underline break-all"
                        >
                          {o.website}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const tabCls = (active: boolean) =>
  `px-4 py-2 rounded-lg text-[14px] font-bold ${
    active
      ? "bg-[#6B7B3A] text-white"
      : "bg-white dark:bg-zinc-800 text-[#3A342A] dark:text-zinc-200 border border-[#E8E0D0] dark:border-zinc-700"
  }`;
