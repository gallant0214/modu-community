import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "스포츠마켓 — 모두의 지도사 커뮤니티",
  description: "운동인이 즐겨 찾는 스포츠웨어·닭가슴살·보충제 브랜드 추천 리스트.",
};

type Item = { name: string; url: string; desc?: string };

// 큐레이션 리스트. 수정/추가는 이 배열만 손보면 됩니다.
const SPORTSWEAR: Item[] = [
  { name: "Nike Korea", url: "https://www.nike.com/kr/", desc: "글로벌 대표 스포츠 브랜드" },
  { name: "Adidas Korea", url: "https://www.adidas.co.kr/", desc: "러닝·트레이닝 라인업" },
  { name: "Under Armour", url: "https://www.underarmour.co.kr/", desc: "기능성 웨어 전문" },
  { name: "Puma Korea", url: "https://kr.puma.com/", desc: "라이프+퍼포먼스" },
  { name: "New Balance Korea", url: "https://www.nbkorea.com/", desc: "러닝화·트레이닝복" },
  { name: "Reebok Korea", url: "https://www.reebok.co.kr/", desc: "크로스핏·러닝 강세" },
  { name: "Fila Korea", url: "https://www.fila.co.kr/", desc: "레트로 스포츠" },
  { name: "Descente Korea", url: "https://www.descente.co.kr/", desc: "골프·러닝·트레이닝" },
  { name: "Prospecs", url: "https://www.prospecs.com/", desc: "국내 러닝화·워킹화" },
  { name: "Le Coq Sportif Korea", url: "https://www.lecoqsportif.co.kr/", desc: "프렌치 스포츠 캐주얼" },
  { name: "Andar (안다르)", url: "https://www.andar.co.kr/", desc: "요가·필라테스 웨어" },
  { name: "Xexymix (젝시믹스)", url: "https://www.xexymix.com/", desc: "레깅스·요가복" },
  { name: "Mulawear (뮬라웨어)", url: "https://www.mulawear.com/", desc: "액티브웨어" },
  { name: "STL Korea", url: "https://www.stl-korea.co.kr/", desc: "요가·필라테스 라인" },
  { name: "Champion", url: "https://www.champion-usa.co.kr/", desc: "빈티지 스포츠웨어" },
  { name: "Gymshark", url: "https://www.gymshark.com/", desc: "글로벌 피트니스 웨어" },
  { name: "Alphalete", url: "https://alphaleteathletics.com/", desc: "북미 피트니스 프리미엄" },
  { name: "Lululemon", url: "https://www.lululemon.com/", desc: "요가·러닝 웨어" },
  { name: "Kolon Sport", url: "https://www.kolonsport.com/", desc: "아웃도어·러닝" },
  { name: "K2 Korea", url: "https://www.k2.co.kr/", desc: "아웃도어 스포츠" },
];

const CHICKEN: Item[] = [
  { name: "랭킹닭컴", url: "https://www.rankingdak.com/", desc: "닭가슴살 종합몰" },
  { name: "미트리", url: "https://www.meatree.co.kr/", desc: "저염 닭가슴살" },
  { name: "아임닭", url: "https://www.imdak.co.kr/", desc: "다양한 맛 라인업" },
  { name: "다신샵", url: "https://www.dashinshop.com/", desc: "닭가슴살·도시락" },
  { name: "잇메이트", url: "https://www.eatmate.co.kr/", desc: "즉석 닭가슴살" },
  { name: "오빠닭", url: "https://www.oppadak.com/", desc: "훈제 닭가슴살" },
  { name: "허닭", url: "https://www.heodak.com/", desc: "닭가슴살 전문" },
  { name: "굽네몰", url: "https://www.goobnemall.com/", desc: "굽네 공식몰" },
  { name: "순수한닭", url: "https://www.soonchicken.co.kr/", desc: "무첨가 닭가슴살" },
  { name: "프레시메이트", url: "https://www.freshmate.co.kr/", desc: "프리미엄 도시락·닭가슴살" },
];

const SUPPLEMENT: Item[] = [
  { name: "마이프로틴 코리아", url: "https://www.myprotein.co.kr/", desc: "글로벌 프로틴 브랜드" },
  { name: "몬스터짐", url: "https://www.monsterzym.com/", desc: "종합 보충제 쇼핑몰" },
  { name: "아이허브 (iHerb)", url: "https://kr.iherb.com/", desc: "해외 직구 종합몰" },
  { name: "GNC Korea", url: "https://www.gncmall.co.kr/", desc: "종합 건강기능식품" },
  { name: "뉴트리원", url: "https://www.nutrione.co.kr/", desc: "국내 프로틴·비타민" },
  { name: "셀렉스", url: "https://www.selex.co.kr/", desc: "매일유업 프로틴" },
  { name: "웨이볼릭", url: "https://www.maeilhealthnutrition.com/", desc: "매일헬스뉴트리션" },
  { name: "Optimum Nutrition", url: "https://www.optimumnutrition.com/", desc: "글로벌 프로틴 파우더" },
  { name: "닥터린", url: "https://www.drlin.co.kr/", desc: "종합 건강기능식품" },
  { name: "종근당건강", url: "https://www.ckdhc.com/", desc: "국내 건강기능식품" },
];

function StoreCard({ item }: { item: Item }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-[#6B7B3A] dark:hover:border-[#A8B87A] hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 group-hover:text-[#6B7B3A] dark:group-hover:text-[#A8B87A] truncate">
            {item.name}
          </div>
          {item.desc && (
            <div className="mt-1 text-[12px] text-[#8C8270] dark:text-zinc-400 truncate">
              {item.desc}
            </div>
          )}
        </div>
        <svg
          className="shrink-0 w-4 h-4 text-[#A89B80] group-hover:text-[#6B7B3A] dark:text-zinc-500 dark:group-hover:text-[#A8B87A]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
    </a>
  );
}

function Section({
  title,
  emoji,
  description,
  items,
}: {
  title: string;
  emoji: string;
  description: string;
  items: Item[];
}) {
  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-[18px] font-bold text-[#2A251D] dark:text-zinc-100 flex items-center gap-2">
          <span aria-hidden="true">{emoji}</span>
          {title}
          <span className="text-[12px] font-normal text-[#A89B80] dark:text-zinc-500">
            ({items.length})
          </span>
        </h2>
        <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-400">{description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <StoreCard key={item.url} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function MarketPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
      <header className="mb-8">
        <div className="text-4xl mb-2" aria-hidden="true">🛍️</div>
        <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100">
          스포츠마켓
        </h1>
        <p className="mt-2 text-[13px] sm:text-[14px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
          운동인이 즐겨 찾는 스포츠웨어·닭가슴살·보충제 브랜드를 모았습니다.
          <br />
          상호명을 누르면 새 창으로 해당 사이트가 열립니다.
        </p>
        <p className="mt-2 text-[11.5px] text-[#A89B80] dark:text-zinc-500">
          ※ 참고용 큐레이션 리스트이며, 공식 순위 아닙니다. 구매 전 각 사이트에서 상품·배송 정보를 직접 확인하세요.
        </p>
      </header>

      <Section
        title="스포츠웨어 브랜드"
        emoji="👟"
        description="운동인이 자주 선택하는 국내·해외 스포츠웨어 브랜드 20선"
        items={SPORTSWEAR}
      />

      <Section
        title="닭가슴살"
        emoji="🍗"
        description="식단 관리에 자주 쓰이는 닭가슴살 브랜드 10선"
        items={CHICKEN}
      />

      <Section
        title="보충제"
        emoji="💊"
        description="프로틴·비타민 등 인기 보충제 쇼핑몰 10선"
        items={SUPPLEMENT}
      />
    </main>
  );
}
