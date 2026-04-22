"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { exercises, categories, referenceCategoriesSet } from "@/app/lib/data/practical";
import { practicalSports, type PracticalSport } from "@/app/lib/data/practical_sports";
import { oralSports, type OralSport } from "@/app/lib/data/oral";

type MainTab = "practical" | "oral";

// 공통 영역 (도핑/응급처치/성폭력·인권) 추출 + 생활체육 공통
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
    { id: 2, question: "생활체육(프로그램)의 구성요인을 말하시오.", answer: "생활체육 프로그램의 구성요인은 ① 참가자, ② 지도자, ③ 시설, ④ 프로그램, ⑤ 재정, ⑥ 안정성의 6가지입니다. 이 요소들이 균형 있게 갖춰져야 효과적인 생활체육 프로그램을 운영할 수 있습니다." },
    { id: 3, question: "생활체육 프로그램의 고려사항(주의사항)을 설명하시오.", answer: "생활체육 프로그램 구성 시에는 프로그램의 ① 목적, ② 목표, ③ 철학, ④ 세부운영사항, ⑤ 평가계획, ⑥ 개선계획을 고려해야 합니다. 참여자의 특성과 요구를 반영하고 체계적으로 계획·실행·평가하는 것이 중요합니다." },
    { id: 4, question: "생활체육 프로그램의 계획과정을 설명하시오.", answer: "생활체육 프로그램의 계획과정은 프로그램 목적이해 → 욕구조사 → 목표설정 → 계획수립 → 실행 → 평가 → 보완의 순서로 진행됩니다. 각 단계를 체계적으로 수행하여 참여자의 만족도와 프로그램의 효과를 높여야 합니다." },
    { id: 5, question: "생활체육 프로그램의 구성원리(계획원리)를 설명하시오.", answer: "생활체육 프로그램의 구성원리에는 ① 평가성: 프로그램을 평가할 수 있어야 하고, ② 전문성: 전문적인 내용을 담아야 하며, ③ 다양성: 다양한 운동을 포함해야 하고, ④ 개별성: 개별의 목적에 맞게 구성해야 하며, ⑤ 목적성: 명확한 목적이 있어야 하고, ⑥ 창조성: 창의적으로 구성할 수 있어야 합니다." },
    { id: 6, question: "생활체육의 기능 3가지를 설명하시오.", answer: "① 생리적 기능: 신체활동을 통한 건강과 체력증진, 근육량과 기초대사량 증가로 인한 비만과 같은 성인병 예방. ② 심리적 기능: 신체발달을 통한 자신감 상승, 스트레스 해소, 소속감 유발. ③ 사회적 기능: 사회의 생활원리와 조화를 이루어 살아가도록 사회화시키고, 이질적인 개인유기체를 공동체로 화합시키는 기능." },
    { id: 7, question: "생활체육의 필요성을 설명하시오.", answer: "① 주 5일제 등의 근로시간 단축으로 건전한 여가시간 활용이 필요합니다. ② 현대인의 고질적인 운동부족으로 사회구성원 전반의 체력이 저하되고 있습니다. ③ 엘리트체육에서 벗어나 국민 건강 유지를 위한 평생체육의 필요성이 대두되었습니다. ④ 스트레스와 우울감 같은 부정적 감정을 효과적으로 해소할 장치가 필요합니다. ⑤ 현대 사회의 개별화로 인한 공동체 의식이 약화되었습니다." },
    { id: 8, question: "생활체육 지도자의 자질을 설명하시오.", answer: "생활체육 지도자의 자질에는 ① 의사전달능력, ② 활달하고 강인한 성격, ③ 투철한 사명감, ④ 도덕적품성, ⑤ 칭찬의 미덕, ⑥ 공정성이 필요합니다. 참여자에게 신뢰를 주고 효과적으로 지도할 수 있는 인격적 소양을 갖추어야 합니다." },
    { id: 9, question: "생활체육 지도자의 역할을 설명하시오.", answer: "① 참가자의 욕구, 체력, 연령 등 개인별 특이성을 고려하여 지도합니다. ② 새롭고 효과적인 프로그램을 개발하여 참가자의 자발적인 참여와 흥미를 유도합니다. ③ 개인 및 집단을 대표하여 목표를 설정하고 동기부여, 평가를 돕습니다. ④ 안전사고를 예방하고 시설물 관리를 책임집니다." },
    { id: 10, question: "생활체육 지도자의 기능을 설명하시오.", answer: "생활체육 지도자의 기능은 체육활동을 조직하고 목표와 달성 방법을 제시하며 평가를 하고, 그 외에 동기를 부여하고 긍정적 분위기를 조성하며 동료의식을 강화시키는 기능을 합니다. (★생활체육의 기능과 분리하여 암기)" },
    { id: 11, question: "생활체육 지도의 원리를 설명하시오.", answer: "① 목적의 원리: 목적과 목표 설정 후 동기부여. ② 개성화의 원리: 참가자의 욕구나 참가자 간의 개인차를 고려하여 지도. ③ 창조의 원리: 창조적인 체육활동을 도모. ④ 계통성의 원리: 일정한 체계를 인지하고 통일되도록 훈련. ⑤ 평가의 원리: 지도 결과를 평가하여 참가자가 인지할 수 있도록 한다. ⑥ 사회화의 원리: 유대를 형성하여 집단생활을 배우도록 한다. ⑦ 자발성의 원리: 참가자들이 자발적으로 참여할 수 있도록 유도한다. ⑧ 요약 전달의 원리: 참가자에게 다양한 관련 정보를 전달해야 한다." },
    { id: 12, question: "생활체육 지도의 목표를 설명하시오.", answer: "생활체육 지도의 목표는 '기·운·의·합·조' 5가지입니다. ① 기: 기분전환과 즐거움을 통해 건전한 여가시간을 누리게 함. ② 운: 운동으로 체력을 증진시키고 건강유지에 힘씀. ③ 의: 의사전달능력과 독립심을 배양시킴. ④ 합: 협동성, 준법정신, 책임감을 배양하고 공동체 의식을 증진시킴. ⑤ 조: 조화로운 신체적, 정신적, 사회적 발달을 꾀함." },
    { id: 13, question: "생활체육 지도자가 유의할 점을 설명하시오.", answer: "시간을 지키고 복장에 유의하며 개인의 특성을 파악하여 훈련계획표를 지참하고 연습계획을 알고 있으며 칭찬과 질책을 분배하고 모든선수를 평등하게 대하며 긍정적인 대화와 적절한 언어를 사용한다." },
    { id: 14, question: "트레이닝 5가지 원리를 설명하시오.", answer: "① 과부하의 원리: 현재 수준보다 강한 자극을 주어야 체력이 향상됩니다. ② 점진성의 원리: 운동 강도를 서서히 단계적으로 증가시켜야 합니다. ③ 반복성의 원리: 꾸준한 반복을 통해 운동 효과가 나타납니다. ④ 개별성의 원리: 개인의 체력 수준과 목표에 맞는 프로그램이 필요합니다. ⑤ 특이성의 원리: 훈련한 부위와 방식에 맞는 적응이 일어납니다. (※ 다양성의 원리를 포함하여 6가지로 구분하기도 합니다.)" },
  ];

  return [
    { id: "_common_lifesports", name: "생활체육 (공통)", questions: lifeSportsQs },
    { id: "_common_doping", name: "도핑 (공통)", questions: strip(allByCategory["도핑"]) },
    { id: "_common_firstaid", name: "응급처치 (공통)", questions: strip(allByCategory["응급처치"]) },
    { id: "_common_rights", name: "성폭력·인권 (공통)", questions: strip(allByCategory["인권·성폭력"]) },
  ];
}

const commonSections = getCommonSections();

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
const BOOKMARK_KEY_PRACTICAL = "practical_bookmarks";
const BOOKMARK_KEY_ORAL = "oral_bookmarks";

export default function PracticalPage() {
  const [tab, setTab] = useState<MainTab>("practical");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [openQuestionId, setOpenQuestionId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  // 북마크 state
  const [practicalBookmarks, setPracticalBookmarks] = useState<Set<string>>(new Set());
  const [oralBookmarks, setOralBookmarks] = useState<Set<string>>(new Set());

  const resetToList = useCallback(() => {
    setSelectedSport(null);
    setOpenItem(null);
    setOpenQuestionId(null);
    try { sessionStorage.removeItem(PRACTICAL_STATE_KEY); } catch {}
  }, []);

  // 북마크 로드
  useEffect(() => {
    try {
      const p = localStorage.getItem(BOOKMARK_KEY_PRACTICAL);
      if (p) setPracticalBookmarks(new Set(JSON.parse(p)));
      const o = localStorage.getItem(BOOKMARK_KEY_ORAL);
      if (o) setOralBookmarks(new Set(JSON.parse(o)));
    } catch {}
  }, []);

  const toggleBookmark = (sportId: string, type: MainTab) => {
    if (type === "practical") {
      setPracticalBookmarks((prev) => {
        const next = new Set(prev);
        if (next.has(sportId)) next.delete(sportId); else next.add(sportId);
        localStorage.setItem(BOOKMARK_KEY_PRACTICAL, JSON.stringify([...next]));
        return next;
      });
    } else {
      setOralBookmarks((prev) => {
        const next = new Set(prev);
        if (next.has(sportId)) next.delete(sportId); else next.add(sportId);
        localStorage.setItem(BOOKMARK_KEY_ORAL, JSON.stringify([...next]));
        return next;
      });
    }
  };

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
    const allOralItems = [...commonSections, ...oralSports];
    const sport = allOralItems.find((s) => s.id === selectedSport);
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
            {/* 북마크된 종목 */}
            {practicalBookmarks.size > 0 && (() => {
              const bookmarkedSports = [
                ...(practicalBookmarks.has("bodybuilding") ? [{ id: "bodybuilding", name: "보디빌딩", sub: `${exercises.length}개 동작` }] : []),
                ...practicalSports.filter((s) => practicalBookmarks.has(s.id)).map((s) => ({
                  id: s.id, name: s.name, sub: `${s.sections.reduce((a, sec) => a + sec.items.length, 0)}개 평가항목`,
                })),
              ];
              if (bookmarkedSports.length === 0) return null;
              return (
                <>
                  <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">
                    <BookmarkIcon filled /> 즐겨찾기
                  </p>
                  <div className="flex flex-col gap-2 mb-5">
                    {bookmarkedSports.map((s) => (
                      <SportButton key={`bm-${s.id}`} name={s.name} sub={s.sub}
                        bookmarked onToggleBookmark={() => toggleBookmark(s.id, "practical")}
                        onClick={() => setSelectedSport(s.id)} />
                    ))}
                  </div>
                </>
              );
            })()}

            {/* 보디빌딩 */}
            <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">보디빌딩</p>
            <button onClick={() => setSelectedSport("bodybuilding")}
              className={`w-full flex items-center justify-between rounded-3xl px-4 py-4 mb-1 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-20px_rgba(107,93,71,0.45)] ${surfaceCard}`}>
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
            <div className="flex justify-end mb-5 pr-1">
              <button onClick={(e) => { e.stopPropagation(); toggleBookmark("bodybuilding", "practical"); }}
                className="p-1.5 text-[#A89B80] hover:text-[#6B7B3A] transition-colors" aria-label="즐겨찾기">
                <BookmarkIcon filled={practicalBookmarks.has("bodybuilding")} />
              </button>
            </div>

            {/* 나머지 종목 */}
            <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">종목 선택</p>
            <div className="flex flex-col gap-2">
              {practicalSports.map((sport) => (
                <SportButton key={sport.id} name={sport.name}
                  sub={`${sport.sections.reduce((a, s) => a + s.items.length, 0)}개 평가항목`}
                  bookmarked={practicalBookmarks.has(sport.id)}
                  onToggleBookmark={() => toggleBookmark(sport.id, "practical")}
                  onClick={() => setSelectedSport(sport.id)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            {/* 북마크된 종목 */}
            {oralBookmarks.size > 0 && (() => {
              const bookmarkedOral = oralSports.filter((s) => oralBookmarks.has(s.id));
              if (bookmarkedOral.length === 0) return null;
              return (
                <>
                  <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">
                    <BookmarkIcon filled /> 즐겨찾기
                  </p>
                  <div className="flex flex-col gap-2 mb-5">
                    {bookmarkedOral.map((s) => (
                      <SportButton key={`bm-${s.id}`} name={s.name}
                        sub={`${s.questions.length}개 문항`}
                        bookmarked onToggleBookmark={() => toggleBookmark(s.id, "oral")}
                        onClick={() => { setSelectedSport(s.id); setOpenQuestionId(null); }} />
                    ))}
                  </div>
                </>
              );
            })()}

            {/* 공통 영역 */}
            <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">공통 영역</p>
            <div className="flex flex-col gap-2 mb-5">
              {commonSections.map((section) => (
                <button key={section.id} onClick={() => { setSelectedSport(section.id); setOpenQuestionId(null); }}
                  className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-20px_rgba(107,93,71,0.45)] bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/10 border border-[#6B7B3A]/20 dark:border-[#6B7B3A]/30`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#6B7B3A]/15 dark:bg-[#6B7B3A]/20 flex items-center justify-center">
                      <span className={`font-bold text-sm ${accentText}`}>
                        {section.name.includes("생활") ? "L" : section.name.includes("도핑") ? "D" : section.name.includes("응급") ? "F" : "H"}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-[#2F2A24] dark:text-zinc-100">{section.name}</p>
                      <p className="text-xs text-[#8E8375] dark:text-zinc-500 mt-0.5">{section.questions.length}개 문항</p>
                    </div>
                  </div>
                  <ChevronRight />
                </button>
              ))}
            </div>
            {/* 종목별 */}
            <p className="text-xs font-bold text-[#8E8375] dark:text-zinc-500 mb-2">종목 선택</p>
            <div className="flex flex-col gap-2">
              {oralSports.map((sport) => (
                <SportButton key={sport.id} name={sport.name}
                  sub={`${sport.questions.length}개 문항`}
                  bookmarked={oralBookmarks.has(sport.id)}
                  onToggleBookmark={() => toggleBookmark(sport.id, "oral")}
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
            className="flex gap-2 overflow-x-auto pb-1 cursor-grab select-none category-scroll"
            style={{ WebkitOverflowScrolling: "touch" }}
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
        {/* 참고용 카테고리 경고 배너 (핏모델 등) */}
        {referenceCategoriesSet.has(category) && (
          <div className="sticky top-[calc(3.5rem+52px)] z-[5] mx-3 mt-3 mb-0 rounded-xl bg-[#FFF0F0] dark:bg-[#2A1515] border border-[#C0392B]/30 px-4 py-2.5 text-center">
            <p className="text-[12px] font-bold text-[#C0392B]">시험에 출제되는 종목은 아닙니다. 신설 종목으로 참고용입니다.</p>
          </div>
        )}
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

function SportButton({ name, sub, onClick, bookmarked, onToggleBookmark }: {
  name: string; sub: string; onClick: () => void; bookmarked?: boolean; onToggleBookmark?: () => void;
}) {
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
      <div className="flex items-center gap-1">
        {onToggleBookmark && (
          <span onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
            className="p-1.5 text-[#A89B80] hover:text-[#6B7B3A] transition-colors" role="button" aria-label="즐겨찾기">
            <BookmarkIcon filled={bookmarked} />
          </span>
        )}
        <ChevronRight />
      </div>
    </button>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg className="w-4 h-4 text-[#6B7B3A] inline-block" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5 2h14a1 1 0 011 1v19.143a.5.5 0 01-.766.424L12 18.03l-7.234 4.537A.5.5 0 014 22.143V3a1 1 0 011-1z" />
    </svg>
  ) : (
    <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="w-4 h-4 text-[#9B9084] dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
