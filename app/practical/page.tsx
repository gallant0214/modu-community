"use client";

import { useState } from "react";
import Link from "next/link";
import { exercises, categories } from "@/app/lib/data/practical";
import { practicalSports, type PracticalSport } from "@/app/lib/data/practical_sports";
import { oralSports, type OralSport } from "@/app/lib/data/oral";

type MainTab = "practical" | "oral";

// ==========================================
// 공통 구술 섹션 (도핑/응급처치/성폭력·인권/생활체육)
// ==========================================
function getCommonSections(): OralSport[] {
  const allByCategory: Record<string, { question: string; answer: string }[]> = {
    "도핑": [], "응급처치": [], "인권·성폭력": [],
  };
  for (const sport of oralSports) {
    for (const q of sport.questions) {
      if (q.category && allByCategory[q.category]) {
        allByCategory[q.category].push({ question: q.question, answer: q.answer });
      }
    }
  }
  const dedup = (qs: { question: string; answer: string }[]) => {
    const seen = new Set<string>();
    return qs.filter((q) => { if (seen.has(q.question)) return false; seen.add(q.question); return true; });
  };
  const strip = (qs: { question: string; answer: string }[]) =>
    dedup(qs).map((q, i) => ({ id: i + 1, question: q.question, answer: q.answer }));

  const lifeSportsQs = [
    { id: 1, question: "생활체육의 정의를 설명하시오.", answer: "생활체육이란 일상생활에서 여가시간을 활용하여 남녀노소 누구나 즐길 수 있는 체육활동을 말합니다. 엘리트 스포츠와 달리 승리보다는 참여와 즐거움, 건강 증진에 초점을 맞추며, 평생에 걸쳐 지속 가능한 스포츠 문화를 만드는 것이 핵심 목적입니다." },
    { id: 2, question: "생활체육(프로그램)의 구성요인을 말하시오.", answer: "생활체육 프로그램의 구성요인은 ① 참가자, ② 지도자, ③ 시설, ④ 프로그램, ⑤ 재정, ⑥ 안정성의 6가지입니다." },
    { id: 3, question: "트레이닝 5가지 원리를 설명하시오.", answer: "① 과부하의 원리 ② 점진성의 원리 ③ 반복성의 원리 ④ 개별성의 원리 ⑤ 특이성의 원리" },
  ];

  return [
    { id: "_common_lifesports", name: "생활체육 (공통)", questions: lifeSportsQs },
    { id: "_common_doping", name: "도핑 (공통)", questions: strip(allByCategory["도핑"]) },
    { id: "_common_firstaid", name: "응급처치 (공통)", questions: strip(allByCategory["응급처치"]) },
    { id: "_common_rights", name: "성폭력·인권 (공통)", questions: strip(allByCategory["인권·성폭력"]) },
  ];
}

const commonSections = getCommonSections();

// ==========================================
// 메인 페이지
// ==========================================
export default function PracticalPage() {
  const [tab, setTab] = useState<MainTab>("practical");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [openQuestionId, setOpenQuestionId] = useState<number | null>(null);

  const resetToList = () => { setSelectedSport(null); setOpenItem(null); setOpenQuestionId(null); };

  // ===== 실기 종목 상세 =====
  if (tab === "practical" && selectedSport === "bodybuilding") {
    return <BodybuildingView category={selectedCategory} setCategory={setSelectedCategory} onBack={resetToList} />;
  }
  if (tab === "practical" && selectedSport) {
    const sport = practicalSports.find((s) => s.id === selectedSport);
    if (sport) return <SportPracticalView sport={sport} openItem={openItem} setOpenItem={setOpenItem} onBack={resetToList} />;
  }

  // ===== 구술 종목 상세 =====
  if (tab === "oral" && selectedSport) {
    const allItems = [...commonSections, ...oralSports];
    const sport = allItems.find((s) => s.id === selectedSport);
    if (sport) return <OralView sport={sport} openQuestionId={openQuestionId} setOpenQuestionId={setOpenQuestionId} onBack={resetToList} />;
  }

  // ===== 종목 선택 목록 =====
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        {/* 헤더 + 탭 */}
        <div className="px-4 pt-4 pb-0">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">실기 / 구술</h1>
          <div className="flex border-b border-zinc-200 dark:border-zinc-800">
            {(["practical", "oral"] as MainTab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setSelectedSport(null); }}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-colors relative ${
                  tab === t ? "text-blue-600" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}>
                {t === "practical" ? "실기" : "구술"}
                {tab === t && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-full" />}
              </button>
            ))}
          </div>
        </div>

        {tab === "practical" ? (
          <div className="px-4 py-4">
            {/* 보디빌딩 */}
            <p className="text-xs font-bold text-zinc-400 mb-2">보디빌딩</p>
            <button onClick={() => setSelectedSport("bodybuilding")}
              className="w-full flex items-center justify-between bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-xl px-4 py-4 mb-5 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">보</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">보디빌딩</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{exercises.length}개 동작</p>
                </div>
              </div>
              <ChevronRight />
            </button>

            {/* 나머지 종목 */}
            <p className="text-xs font-bold text-zinc-400 mb-2">종목 선택</p>
            <div className="flex flex-col gap-2">
              {practicalSports.map((sport) => (
                <SportButton key={sport.id} name={sport.name}
                  sub={`${sport.sections.reduce((a, s) => a + s.items.length, 0)}개 평가항목`}
                  onClick={() => setSelectedSport(sport.id)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            {/* 공통 영역 */}
            <p className="text-xs font-bold text-zinc-400 mb-2">공통 영역</p>
            <div className="flex flex-col gap-2 mb-5">
              {commonSections.map((s) => (
                <button key={s.id} onClick={() => { setSelectedSport(s.id); setOpenQuestionId(null); }}
                  className="w-full flex items-center justify-between bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-xl px-4 py-3.5 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">
                        {s.name.includes("생활") ? "L" : s.name.includes("도핑") ? "D" : s.name.includes("응급") ? "F" : "H"}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{s.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{s.questions.length}개 문항</p>
                    </div>
                  </div>
                  <ChevronRight />
                </button>
              ))}
            </div>
            {/* 종목별 */}
            <p className="text-xs font-bold text-zinc-400 mb-2">종목 선택</p>
            <div className="flex flex-col gap-2">
              {oralSports.map((sport) => (
                <SportButton key={sport.id} name={sport.name}
                  sub={`${sport.questions.length}개 문항`}
                  onClick={() => { setSelectedSport(sport.id); setOpenQuestionId(null); }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 보디빌딩 상세 뷰
// ==========================================
function BodybuildingView({ category, setCategory, onBack }: { category: string; setCategory: (c: string) => void; onBack: () => void }) {
  const allCategories = ["전체", ...categories];
  const filtered = category === "전체" ? exercises : exercises.filter((e) => e.category === category);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <BackHeader title="보디빌딩" onBack={onBack} />
        {/* 부위 필터 */}
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {allCategories.map((cat) => {
              const count = cat === "전체" ? exercises.length : exercises.filter(e => e.category === cat).length;
              return (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    category === cat ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                  }`}>
                  {cat} <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* 그리드 */}
        <div className="p-3 grid grid-cols-2 gap-3">
          {filtered.map((ex) => (
            <Link key={ex.id} href={`/practical/exercise/${ex.id}`}
              className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-100 dark:border-zinc-800 hover:shadow-md transition-shadow">
              <div className="aspect-[3/2] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                {ex.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ex.image} alt={ex.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-xs text-zinc-400">이미지 준비중</span>
                )}
              </div>
              <div className="px-3 py-2.5">
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-tight">{ex.name}</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px]">
                  {ex.category}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 일반 종목 실기 상세 뷰
// ==========================================
function SportPracticalView({ sport, openItem, setOpenItem, onBack }: {
  sport: PracticalSport; openItem: string | null; setOpenItem: (v: string | null) => void; onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <BackHeader title={`${sport.name} 실기`} onBack={onBack} />
        <div className="px-4 pt-4 pb-6 space-y-5">
          {sport.sections.map((section, sIdx) => (
            <div key={sIdx}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{section.title}</span>
                {section.points && (
                  <span className="text-[10px] font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">{section.points}</span>
                )}
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <div className="flex flex-col gap-2">
                {section.items.map((item, iIdx) => {
                  const key = `${sIdx}-${iIdx}`;
                  const isOpen = openItem === key;
                  const hasDetail = !!item.detail || !!item.deduction;
                  return (
                    <div key={iIdx} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                      <button onClick={() => hasDetail && setOpenItem(isOpen ? null : key)}
                        className="w-full text-left px-4 py-3.5 flex items-start gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                          {iIdx + 1}
                        </span>
                        <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{item.label}</span>
                        {hasDetail && (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`shrink-0 text-zinc-400 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        )}
                      </button>
                      {isOpen && hasDetail && (
                        <div className="px-4 pb-4">
                          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 ml-9 space-y-2">
                            {item.detail && <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-line">{item.detail}</p>}
                            {item.deduction && (
                              <div className="flex items-start gap-1.5">
                                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950 px-1.5 py-0.5 rounded shrink-0">감점</span>
                                <p className="text-xs text-red-500 leading-relaxed">{item.deduction}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 구술 상세 뷰
// ==========================================
function OralView({ sport, openQuestionId, setOpenQuestionId, onBack }: {
  sport: OralSport; openQuestionId: number | null; setOpenQuestionId: (v: number | null) => void; onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <BackHeader title={sport.name} sub={`${sport.questions.length}문항`} onBack={onBack} />
        <div className="px-4 pt-3 pb-6 space-y-2">
          {sport.questions.map((q, idx) => {
            const prevQ = idx > 0 ? sport.questions[idx - 1] : null;
            const showCat = q.category && (!prevQ || prevQ.category !== q.category);
            return (
              <div key={q.id}>
                {showCat && (
                  <div className="flex items-center gap-2 mt-4 mb-2">
                    <span className="text-[10px] font-bold text-white bg-blue-500 px-2 py-0.5 rounded-full">공통</span>
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{q.category}</span>
                    <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                )}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  <button onClick={() => setOpenQuestionId(openQuestionId === q.id ? null : q.id)}
                    className="w-full text-left px-4 py-3.5 flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      {q.category && (
                        <span className="inline-block text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded mb-1">
                          {q.category}
                        </span>
                      )}
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed">{q.question}</p>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`shrink-0 text-zinc-400 mt-0.5 transition-transform ${openQuestionId === q.id ? "rotate-180" : ""}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {openQuestionId === q.id && (
                    <div className="px-4 pb-4">
                      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 ml-9">
                        <div className="flex items-center gap-1 mb-1.5">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">A. 정답</span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{q.answer}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 공통 컴포넌트
// ==========================================
function BackHeader({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
      <button onClick={onBack} className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1">{title}</span>
      {sub && <span className="text-xs text-zinc-400">{sub}</span>}
    </div>
  );
}

function SportButton({ name, sub, onClick }: { name: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between bg-white dark:bg-zinc-900 rounded-xl px-4 py-3.5 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
          <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{name.charAt(0)}</span>
        </div>
        <div className="text-left">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{name}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
        </div>
      </div>
      <ChevronRight />
    </button>
  );
}

function ChevronRight() {
  return (
    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
