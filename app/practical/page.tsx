"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { exercises, categories } from "@/app/lib/data/practical";
import { practicalSports, type PracticalSport } from "@/app/lib/data/practical_sports";
import { oralSports, type OralSport } from "@/app/lib/data/oral";

type MainTab = "practical" | "oral";

const pageShell = "min-h-screen bg-[#F8F4EC] dark:bg-zinc-950";
const surfaceCard = "bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700";
const softCard = "bg-[#FBF7EB] dark:bg-zinc-900/80 border border-[#E8E0D0] dark:border-zinc-700";
const accentText = "text-[#6B7B3A] dark:text-[#A8B87A]";
const accentBg = "bg-[#6B7B3A] text-white";
const accentSoft = "bg-[#F5F0E5] text-[#6B7B3A] dark:bg-zinc-800 dark:text-[#A8B87A]";

// ==========================================
// 메인 페이지
// ==========================================
const PRACTICAL_STATE_KEY = "practical_nav_state";

export default function PracticalPage() {
  const [tab, setTab] = useState<MainTab>("practical");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [openQuestionId, setOpenQuestionId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  const resetToList = useCallback(() => {
    setSelectedSport(null);
    setOpenItem(null);
    setOpenQuestionId(null);
    try { sessionStorage.removeItem(PRACTICAL_STATE_KEY); } catch {}
  }, []);

  // 초기 마운트 시 sessionStorage에서 상태 복구 (exercise 상세에서 뒤로가기 시 이전 뷰 유지)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PRACTICAL_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.tab) setTab(saved.tab);
        if (saved.selectedSport) setSelectedSport(saved.selectedSport);
        if (saved.selectedCategory) setSelectedCategory(saved.selectedCategory);
      }
    } catch {}
    setRestored(true);
  }, []);

  // 상태 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (!restored) return;
    try {
      if (selectedSport) {
        sessionStorage.setItem(
          PRACTICAL_STATE_KEY,
          JSON.stringify({ tab, selectedSport, selectedCategory }),
        );
      } else {
        sessionStorage.removeItem(PRACTICAL_STATE_KEY);
      }
    } catch {}
  }, [restored, tab, selectedSport, selectedCategory]);

  // 브라우저 뒤로가기 처리 (in-page 네비게이션)
  useEffect(() => {
    if (selectedSport) {
      history.pushState({ sport: selectedSport }, "");
    }
  }, [selectedSport]);

  useEffect(() => {
    const handlePopState = () => {
      if (selectedSport) {
        resetToList();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedSport, resetToList]);

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
    const sport = oralSports.find((s) => s.id === selectedSport);
    if (sport) return <OralView sport={sport} openQuestionId={openQuestionId} setOpenQuestionId={setOpenQuestionId} onBack={resetToList} />;
  }

  // ===== 종목 선택 목록 =====
  return (
    <div className={pageShell}>
      <div className="mx-auto max-w-2xl">
        <div className="px-4 pt-4 pb-0">
          <section className={`relative overflow-hidden rounded-3xl p-6 sm:p-7 mb-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.28)] ${surfaceCard}`}>
            <div aria-hidden className="absolute -top-16 -right-10 w-40 h-40 rounded-full bg-[#6B7B3A]/10 blur-3xl" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
            <div className="relative">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold mb-3 ${accentSoft}`}>
                같은 종목을 준비하는 사람들과
              </span>
              <h1 className="text-[26px] sm:text-[28px] font-bold tracking-[-0.03em] text-[#2F2A24] dark:text-zinc-100 mb-2 leading-tight">
                운동 종목별 이야기와 후기,
                <br />
                준비 정보가 모이는 곳
              </h1>
              <p className="text-sm leading-relaxed text-[#6B5D47] dark:text-zinc-400">
                시험 준비 과정, 실기·구술 팁, 현장 경험, 일상적인 종목 이야기까지.
                각 운동 종목에 대한 다양한 이야기를 한곳에서 보고 나눌 수 있습니다.
              </p>
            </div>
          </section>

          <div className={`flex rounded-2xl p-1 mb-4 ${surfaceCard}`}>
            {(["practical", "oral"] as MainTab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setSelectedSport(null); }}
                className={`flex-1 py-3 text-sm font-semibold text-center rounded-xl transition-colors relative ${
                  tab === t
                    ? `${accentBg} shadow-[0_8px_18px_-12px_rgba(107,123,58,0.65)]`
                    : "text-[#7C7368] dark:text-zinc-400 hover:text-[#4F473D] dark:hover:text-zinc-200"
                }`}>
                {t === "practical" ? "실기" : "구술"}
              </button>
            ))}
          </div>
        </div>

        {tab === "practical" ? (
          <div className="px-4 py-4">
            {/* 보디빌딩 */}
            <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">보디빌딩</p>
            <button onClick={() => setSelectedSport("bodybuilding")}
              className={`w-full flex items-center justify-between rounded-3xl px-4 py-4 mb-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-20px_rgba(107,93,71,0.45)] ${surfaceCard}`}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
                  <span className={`font-bold text-sm ${accentText}`}>보</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-[#2F2A24] dark:text-zinc-100">보디빌딩</p>
                  <p className="text-xs text-[#8E8375] dark:text-zinc-500 mt-0.5">{exercises.length}개 동작</p>
                </div>
              </div>
              <ChevronRight />
            </button>

            {/* 나머지 종목 */}
            <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">종목 선택</p>
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
            {/* 종목별 */}
            <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">종목 선택</p>
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
  // categories 에 이미 "전체"가 포함돼 있으면 중복 방지
  const allCategories = categories[0] === "전체" ? [...categories] : ["전체", ...categories];
  const filtered = category === "전체" ? exercises : exercises.filter((e) => e.category === category);

  // 데스크톱 드래그 스크롤
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.pageX - (scrollRef.current?.offsetLeft || 0);
    scrollLeft.current = scrollRef.current?.scrollLeft || 0;
    if (scrollRef.current) scrollRef.current.style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - (scrollRef.current.offsetLeft || 0);
    scrollRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };

  return (
    <div className={pageShell}>
      <div className="mx-auto max-w-2xl">
        <BackHeader title="보디빌딩" onBack={onBack} />
        {/* 부위 필터 (sticky + 드래그 스크롤) */}
        <div className="sticky top-14 z-10 px-4 py-3 border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#F8F4EC] dark:bg-zinc-950">
          <div
            ref={scrollRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            className="flex gap-2 overflow-x-auto pb-1 cursor-grab select-none"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            {allCategories.map((cat) => {
              const count = cat === "전체" ? exercises.length : exercises.filter(e => e.category === cat).length;
              return (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    category === cat ? accentBg : "bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400"
                  }`}>
                  {cat} <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* 그리드 */}
        <div className="p-3 grid grid-cols-2 gap-3">
          {filtered.map((ex) => {
            // 포즈 카테고리는 세로 이미지 → portrait 비율
            const isPose = !["가슴","이두","삼두","전완","등","어깨","하체","전체"].includes(ex.category);
            return (
            <Link key={ex.id} href={`/practical/exercise/${ex.id}`}
              className={`rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-20px_rgba(107,93,71,0.45)] ${surfaceCard}`}>
              <div className={`${isPose ? "aspect-[2/3]" : "aspect-[3/2]"} bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center`}>
                {ex.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ex.image} alt={ex.name} className={`w-full h-full ${isPose ? "object-contain" : "object-cover"}`} loading="lazy" />
                ) : (
                  <span className="text-xs text-zinc-400">이미지 준비중</span>
                )}
              </div>
              <div className="px-3 py-2.5">
                <p className="text-xs font-bold text-[#2F2A24] dark:text-zinc-100 line-clamp-2 leading-tight">{ex.name}</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 text-[10px]">
                  {ex.category}
                </span>
              </div>
            </Link>
            );
          })}
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
    <div className={pageShell}>
      <div className="mx-auto max-w-2xl">
        <BackHeader title={`${sport.name} 실기`} onBack={onBack} />
        <div className="px-4 pt-4 pb-6 space-y-5">
          {sport.sections.map((section, sIdx) => (
            <div key={sIdx}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-[#5A4F43] dark:text-zinc-300">{section.title}</span>
                {section.points && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accentBg}`}>{section.points}</span>
                )}
                <div className="flex-1 h-px bg-[#E8E0D0] dark:bg-zinc-800" />
              </div>
              <div className="flex flex-col gap-2">
                {section.items.map((item, iIdx) => {
                  const key = `${sIdx}-${iIdx}`;
                  const isOpen = openItem === key;
                  const hasDetail = !!item.detail || !!item.deduction;
                  return (
                    <div key={iIdx} className={`rounded-2xl overflow-hidden ${surfaceCard}`}>
                      <button onClick={() => hasDetail && setOpenItem(isOpen ? null : key)}
                        className="w-full text-left px-4 py-3.5 flex items-start gap-3">
                        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${accentSoft}`}>
                          {iIdx + 1}
                        </span>
                        <span className="flex-1 text-sm font-medium text-[#2F2A24] dark:text-zinc-200 leading-snug">{item.label}</span>
                        {hasDetail && (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`shrink-0 text-[#9B9084] dark:text-zinc-500 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        )}
                      </button>
                      {isOpen && hasDetail && (
                        <div className="px-4 pb-4">
                          <div className="border-t border-[#E8E0D0] dark:border-zinc-800 pt-3 ml-9 space-y-2">
                            {item.detail && <p className="text-xs text-[#6B5D47] dark:text-zinc-400 leading-relaxed whitespace-pre-line">{item.detail}</p>}
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
    <div className={pageShell}>
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
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accentBg}`}>공통</span>
                    <span className="text-xs font-bold text-[#6B5D47] dark:text-zinc-400">{q.category}</span>
                    <div className="flex-1 h-px bg-[#E8E0D0] dark:bg-zinc-800" />
                  </div>
                )}
                <div className={`rounded-2xl overflow-hidden ${surfaceCard}`}>
                  <button onClick={() => setOpenQuestionId(openQuestionId === q.id ? null : q.id)}
                    className="w-full text-left px-4 py-3.5 flex items-start gap-3">
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${accentSoft}`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      {q.category && (
                        <span className="inline-block text-[10px] font-medium text-[#8E8375] dark:text-zinc-400 bg-[#F5F0E5] dark:bg-zinc-800 px-1.5 py-0.5 rounded mb-1">
                          {q.category}
                        </span>
                      )}
                      <p className="text-sm font-medium text-[#2F2A24] dark:text-zinc-200 leading-relaxed">{q.question}</p>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`shrink-0 text-[#9B9084] dark:text-zinc-500 mt-0.5 transition-transform ${openQuestionId === q.id ? "rotate-180" : ""}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {openQuestionId === q.id && (
                    <div className="px-4 pb-4">
                      <div className="border-t border-[#E8E0D0] dark:border-zinc-800 pt-3 ml-9">
                        <div className="flex items-center gap-1 mb-1.5">
                          <span className={`text-xs font-bold ${accentText}`}>A. 정답</span>
                        </div>
                        <p className="text-xs text-[#6B5D47] dark:text-zinc-300 leading-relaxed whitespace-pre-line">{q.answer}</p>
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
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#F8F4EC]/90 dark:bg-zinc-950/90 backdrop-blur-sm">
      <button onClick={onBack} className="p-1.5 text-[#7C7368] hover:text-[#2F2A24] dark:hover:text-zinc-100">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-sm font-semibold text-[#2F2A24] dark:text-zinc-100 flex-1">{title}</span>
      {sub && <span className="text-xs text-[#8E8375] dark:text-zinc-400">{sub}</span>}
    </div>
  );
}

function SportButton({ name, sub, onClick }: { name: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-20px_rgba(107,93,71,0.45)] ${surfaceCard}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
          <span className={`font-bold text-sm ${accentText}`}>{name.charAt(0)}</span>
        </div>
        <div className="text-left">
          <p className="text-sm font-bold text-[#2F2A24] dark:text-zinc-100">{name}</p>
          <p className="text-xs text-[#8E8375] dark:text-zinc-500 mt-0.5">{sub}</p>
        </div>
      </div>
      <ChevronRight />
    </button>
  );
}

function ChevronRight() {
  return (
    <svg className="w-4 h-4 text-[#9B9084] dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
