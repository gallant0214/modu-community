// 48차 임시 단독 삽입 스크립트 (실행 후 즉시 삭제) — 공유 라우트 경로/타 차수 파일 미접촉
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { REGION_GROUPS } from "../app/lib/region-data";

config({ path: resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");

// 48차 작성자 풀 (보디빌딩, 화장품/뷰티 25명)
const AUTHOR_POOL = [
  "립스틱발색","마스카라컬","파운데이션러","아이라이너2","블러셔통",
  "쿠션팩트러","틴트바르기","컨실러덕","섀도우팔레","하이라이터2",
  "뷰러집게러","네일아트러","매니큐어덕","페디큐어2","향수뿌림러",
  "바디로션덕","핸드크림2","선크림바름","클렌징오일","토너패드러",
  "에센스덕2","세럼바르기","마스크팩러","아이크림2","립밤바름러",
];

// 48차 댓글자 풀 (곤충 32명)
const MIXED_POOL = [
  "무당벌레2","사슴벌레러","장수풍뎅이","메뚜기뛰기","방아깨비러",
  "귀뚜라미2","매미울음러","반딧불이덕","개똥벌레2","풍뎅이날기",
  "하늘소더듬","사마귀앞발","거미줄짜기","지네다리2","노래기말기",
  "달팽이집러","지렁이꿈틀","굼벵이2호","번데기허물","누에고치러",
  "꿀벌날개러","말벌침러2","호박벌붕붕","일벌수집러","여왕벌2호",
  "개미행렬러","불개미물기","흰개미2호","진딧물러2","무당벌레점",
  "사슴벌레뿔","집게벌레2",
];

// 이전 차수(46차 + 49차) 풀 — 중복 방지 검증용 (이미 화장품/곤충 카테고리라 안전, 추가 안전망)
const PREV_POOLS: string[] = [
  // 46차 해산물 + 빵/디저트
  "고등어덕","갈치팬","삼치좋아","명태덕","연어러러","송어팬","조기덕","가자미러","오징어덕","낙지팬","문어러러","새우러2","게덕후","꽃게팬","대게덕","멸치러2","장어덕후","굴좋아러","전복팬2","멍게덕후","다랑어덕","참치팬2","마카롱러","티라미수팬","슈크림덕","치즈케익러","초콜릿러2","와플팬2","빙수러러","아이스크림덕","푸딩좋아2","젤리덕후러","도넛러2","컵케이크팬","마들렌덕","다쿠아즈팬","휘낭시에덕","카눌레러2","머핀러2","스콘좋아","베이글러2","크루아상2","식빵좋아러","단팥빵팬","소보로러2","카스테라덕","롤케이크러","밤식빵러","곰보빵덕","호두파이팬","애플파이러","슈톨렌덕",
  // 49차 세면/욕실 + 과자/디저트
  "칫솔컵팬","비누받침러","샴푸펌프2","린스통덕","수건걸이맨","치약짜개러","욕실슬리퍼","샤워헤드2","배수구망러","거품타월팬","목욕바구니","때수건러","면도크림2","세안밴드러","헤어캡쓰","욕실선반2","물비누통러","발수건팬","샤워커튼2","방수매트러","욕실등불","환풍기팬2","변기솔러","세숫대야2","양치컵러","거울김서림","비누곽덕","수건봉러","욕조마개2","샴푸바구니","새우깡러","감자칩2","초코파이덕","사탕봉지러","젤리한봉","팝콘튀김2","쿠키굽기러","와플기계팬","도넛글레이즈","마카롱덕2","브라우니러","카스테라2","약과한입러","양갱한조각","뻥튀기팬2","호떡굽기러","붕어빵2호","계란빵러","꿀호떡팬","땅콩과자2","오란다러","누가바팬2","쌀과자러","별사탕2호","박하사탕러","사탕수수러","캐러멜2호","젤리곰러","막대사탕팬","초콜릿칩러","와플쿠키2","머랭과자러","약밥한입2","식혜한컵러","수정과덕후","매작과러",
];

const WEIGHTS: Record<string, number> = {
  "서울특별시": 5, "경기도": 6, "부산광역시": 3, "인천광역시": 3,
  "대구광역시": 2, "대전광역시": 2, "광주광역시": 2, "울산광역시": 2,
  "세종특별자치시": 1, "강원특별자치도": 1, "충청북도": 1, "충청남도": 1,
  "전북특별자치도": 1, "전라남도": 1, "경상북도": 1, "경상남도": 1, "제주특별자치도": 1,
};
function pickRegion(): string {
  const pool: { name: string; subRegions: { name: string }[] }[] = [];
  for (const g of REGION_GROUPS) {
    const w = WEIGHTS[g.name] ?? 1;
    for (let i = 0; i < w; i++) pool.push(g);
  }
  const group = pool[Math.floor(Math.random() * pool.length)];
  const sub = group.subRegions[Math.floor(Math.random() * group.subRegions.length)];
  return `${group.name} - ${sub.name}`;
}
function authorAt(idx: number): string { return AUTHOR_POOL[idx % AUTHOR_POOL.length]; }
function commentAuthors(postAuthor: string, count: number, seed: number): string[] {
  const result: string[] = [];
  const used = new Set<string>([postAuthor]);
  let idx = seed % MIXED_POOL.length;
  while (result.length < count) {
    const cand = MIXED_POOL[idx % MIXED_POOL.length];
    if (!used.has(cand)) { result.push(cand); used.add(cand); }
    idx++;
  }
  return result;
}

interface RawPost { title: string; content: string; date: string; comments: { content: string; hoursOffset: number }[]; }

const RAW_POSTS: RawPost[] = [
  {
    title: "구술에서 근육 이름 영어로 답하면 감점되나요?",
    content: "영어로 먼저 배워서 한글 명칭이 오히려 어색한데요. 구술 시연 때 근육명을 영어로 말해도 감점 안 되나요? 들어가면서 인사부터 영어로 하면 봐주실까 싶기도 하고요 ㅠㅠ",
    date: "2026-06-20 21:12:00",
    comments: [
      { content: "한글 명칭으로 답하시는 게 안전해요. 채점 기준이 한국어 용어라 영어로만 말하면 감점 위험 있습니다", hoursOffset: 1 },
      { content: "물치과나 의예과 전공이면 영어가 더 익숙하죠 ㅋㅋ 그래도 시험 며칠 안 남았으면 한글 빨리 외워두세요", hoursOffset: 1 },
      { content: "인사부터 영어로 한다고 봐주진 않는다고 들었어요. 그냥 한글 통일이 정답입니다", hoursOffset: 3 },
    ],
  },
  {
    title: "견관절 외전 시 사용 근육 / 수평외전은 어떤 근육?",
    content: "덤벨 레터럴 레이즈 같은 견관절 외전 동작에서 주로 쓰는 근육이 극상근이랑 측면 삼각근 맞나요? 그리고 수평외전(리어 델트류)은 후면 삼각근이랑 다른 근육도 답해야 하는지 헷갈려요.",
    date: "2026-06-20 21:14:00",
    comments: [
      { content: "어깨 외전 = 극상근 + 측면(중간) 삼각근 맞습니다. '주로 사용되는 근육'으로 물으면 측면 삼각근 답해도 돼요", hoursOffset: 1 },
      { content: "수평외전은 후면 삼각근 + 소원근 + 극하근이에요. 후삼·소원·극하 묶어서 외우면 편합니다", hoursOffset: 2 },
      { content: "야기에 후삼이라고 답하면 헷갈리실 수 있으니 측삼/극상(외전) vs 후삼/소원/극하(수평외전) 구분 확실히", hoursOffset: 4 },
    ],
  },
  {
    title: "도핑 컨트롤(도핑 관리)이란? 한 줄 정의 어떻게 하나요",
    content: "구술에서 '도핑 컨트롤에 대해 설명하시오' 나왔다는데, 그냥 도핑을 감시·제재하는 거라고 답하면 되나요? 좀 더 정확한 정의가 궁금합니다.",
    date: "2026-06-20 21:16:00",
    comments: [
      { content: "검사 배치 계획부터 시료 채취·운반, 결과 관리까지 도핑 검사의 전 과정을 관리하는 절차라고 답하면 깔끔합니다", hoursOffset: 1 },
      { content: "도핑 제재로만 이해하면 좁아요. 공정한 스포츠 환경 조성을 위한 검사·관리 체계 전반이라고 보시면 됩니다", hoursOffset: 2 },
    ],
  },
  {
    title: "코어 근육 4가지 답변 - 복횡근·횡격막·다열근·골반기저근",
    content: "코어 운동 설명할 때 코어 근육이 정확히 뭐라고 답해야 하나요? 복횡근 횡격막 다열근 골반기저근 이렇게 4개로 정리하면 되는지 확인 부탁드려요.",
    date: "2026-06-20 21:16:30",
    comments: [
      { content: "맞아요. 복횡근·횡격막·다열근·골반기저근 4개가 코어 안정화 핵심 근육입니다", hoursOffset: 1 },
      { content: "코어운동은 몸통 중심부 근육을 강화해 몸통의 안정성을 높이는 운동이라고 정의 먼저 붙이면 좋아요", hoursOffset: 2 },
      { content: "윗몸 일으키는 복직근만 코어라고 생각하기 쉬운데 심부 안정화 근육 4개로 답하는 게 정답", hoursOffset: 4 },
    ],
  },
  {
    title: "경기 중 금지약물 vs 상시 금지약물 구분이 헷갈려요",
    content: "카나비노이드·흥분제·마약·자극제·글루코코르티코이드 이런 게 경기 중에만 금지인지 상시 금지인지 자꾸 섞여요. 경기 중 금지약물만 따로 정리해 주실 분 있나요?",
    date: "2026-06-20 21:17:00",
    comments: [
      { content: "경기 중 금지: 흥분제(자극제)·마약(마약류)·카나비노이드·글루코코르티코이드. 외우기 '흥마카글'", hoursOffset: 1 },
      { content: "상시 금지는 동화작용제·호르몬·베타2작용제·이뇨제 같은 거고, 위 4개는 경기 중 금지로 분류됩니다", hoursOffset: 2 },
      { content: "글루코코르티코이드 이름이 길어서 다들 버벅대더라고요 ㅋㅋ 천천히 또박또박 말하면 돼요", hoursOffset: 5 },
    ],
  },
  {
    title: "스포츠 폭력 예방을 위한 지도자 역할 4가지",
    content: "구술에서 스포츠 폭력 예방 방법 4가지 물어봤다는데, 어떤 키워드로 답해야 안전할까요? 인권교육 말고 또 뭐가 있는지 정리하고 싶어요.",
    date: "2026-06-20 21:19:00",
    comments: [
      { content: "정기적 인권교육 참여 / 선수 인권보호 매뉴얼 숙지 / 열린 소통 채널 구축 / 심리상담 등 선수지원 시스템 활용", hoursOffset: 1 },
      { content: "행동규범 준수도 키워드로 넣으면 좋아요. 4가지 중 2~3개만 정확히 말해도 점수 받습니다", hoursOffset: 2 },
    ],
  },
  {
    title: "IOC가 정의하는 폭력이란? (성폭력과 헷갈림)",
    content: "심사위원이 'IOC에서 정의하는 폭력이란?' 물어봤는데 성폭력만 말하면 되는 건지 헷갈렸어요. 신체적/언어적/방임 이런 거 다 포함인가요?",
    date: "2026-06-20 21:20:00",
    comments: [
      { content: "신체적 학대·언어(심리)적 학대·방임·성희롱(성폭력)까지 포괄해서 답하는 게 맞습니다", hoursOffset: 1 },
      { content: "성폭력도 폭력의 한 종류라 같이 넣어야 해요. 신체적/정신적/방임/성적 이렇게 묶으면 안전", hoursOffset: 2 },
      { content: "도핑검사 기간 분류(경기중/경기외)랑 폭력 정의는 다른 문제니까 섞지 마세요", hoursOffset: 4 },
    ],
  },
  {
    title: "도핑 검사 기간에 따른 분류는 뭐라고 답하나요",
    content: "후기 보니까 '도핑 검사 기간에 따른 분류' 질문이 나왔다는데, 경기 중 / 경기 외 두 개로 답하면 되나요? 다른 분류가 또 있는지 궁금합니다.",
    date: "2026-06-20 21:21:00",
    comments: [
      { content: "경기 중(In-Competition) / 경기 외(Out-of-Competition) 두 가지로 답하면 맞습니다", hoursOffset: 1 },
      { content: "이 분류 기준으로 금지약물 목록도 갈리니까 같이 묶어서 외워두면 도핑 문제 다 커버돼요", hoursOffset: 2 },
    ],
  },
  {
    title: "후기에 나온 HDL이 뭔가요? (HDL vs LDL)",
    content: "구술 후기 구경하다가 HDL 콜레스테롤 질문을 봤는데, HDL이 좋은 거 맞나요? LDL이랑 헷갈려서요. 한 줄로 어떻게 답하면 될까요?",
    date: "2026-06-20 21:22:00",
    comments: [
      { content: "HDL = 고밀도 지단백, 좋은 콜레스테롤이에요. 간으로 콜레스테롤을 보내 체외 배출을 도와줍니다", hoursOffset: 1 },
      { content: "LDL이 저밀도 지단백, 나쁜 콜레스테롤이라 혈관벽에 쌓이는 쪽이에요. HDL은 그 반대", hoursOffset: 2 },
      { content: "HDL-C 아니고 그냥 HDL입니다 ㅋㅋ C 붙이면 헷갈려요", hoursOffset: 3 },
    ],
  },
  {
    title: "시티드 vs 스탠딩 카프레이즈 - 비복근/가자미근 차이도 답하나요?",
    content: "시티드 카프레이즈랑 스탠딩 카프레이즈 차이가 서서/앉아서 외에도, 비복근이랑 가자미근 사용 차이까지 답해야 하나요?",
    date: "2026-06-20 21:24:00",
    comments: [
      { content: "네 해당돼요. 스탠딩 → 비복근 위주, 시티드(앉아서·무릎 굽힘) → 비복근을 능동적 불충분 상태로 만들어 가자미근 고립", hoursOffset: 1 },
      { content: "무릎 펴면 비복근, 무릎 굽히면 가자미근이라고 외우면 편합니다", hoursOffset: 2 },
    ],
  },
  {
    title: "엉덩관절(고관절) 외전 근육 - 중둔근·소둔근·대퇴근막장근",
    content: "엉덩관절 외전 시 사용되는 근육이랑 내회전 되는 근육이 똑같나요? 중둔근 소둔근까지는 알겠는데 대퇴근막장근도 들어가는지 헷갈려요.",
    date: "2026-06-20 21:25:00",
    comments: [
      { content: "고관절 외전 = 중둔근·소둔근·대퇴근막장근입니다. 외전 근육들이 내회전도 같이 담당해요", hoursOffset: 1 },
      { content: "중둔·소둔이 메인이고 대퇴근막장근(TFL)이 보조로 외전·내회전 도와줍니다", hoursOffset: 2 },
    ],
  },
  {
    title: "운동 직후 영양 섭취 3가지 어떻게 답하나요",
    content: "운동 후 영양 섭취 관련 구술 나왔다는데, 탄수화물·단백질·수분 이렇게 세 개로 답하면 되는지 정리 부탁드려요.",
    date: "2026-06-20 21:39:00",
    comments: [
      { content: "운동 후 고갈된 글리코겐 보충 위해 탄수화물, 손상 근육 회복·단백질 합성 위해 단백질, 땀으로 손실된 수분과 전해질 섭취입니다", hoursOffset: 1 },
      { content: "탄수=글리코겐 / 단백=근회복 / 수분=전해질 이렇게 이유까지 붙이면 만점 답변이에요", hoursOffset: 3 },
    ],
  },
  {
    title: "ROM이 뭔지 + RER(호흡교환율)까지 같이 물어봤어요",
    content: "구술에서 ROM 물어봐서 답했는데 바로 호흡교환율도 물어보시더라고요. ROM이랑 RER 정의 깔끔하게 정리해 주실 분 계실까요?",
    date: "2026-06-20 21:46:00",
    comments: [
      { content: "ROM = 관절이 통증 없는 범위 내에서 가용할 수 있는 가동 범위입니다", hoursOffset: 1 },
      { content: "RER(호흡교환율)은 배출한 이산화탄소 / 소비한 산소의 비율이에요. 1에 가까울수록 탄수화물 사용", hoursOffset: 2 },
    ],
  },
  {
    title: "괴혈병 = 비타민C 결핍 + 비타민C 역할까지",
    content: "괴혈병이 비타민C 결핍으로 생기는 병이고 증상은 잇몸 출혈 이런 거 맞죠? 추가로 비타민C 역할도 물어보면 뭐라고 답해야 하나요?",
    date: "2026-06-20 21:48:00",
    comments: [
      { content: "맞아요. 비타민C가 매우 부족하면 생기는 병이 괴혈병이에요", hoursOffset: 1 },
      { content: "비타민C 역할은 콜라겐(결합조직) 합성, 항산화 작용, 면역력 증강, 철분 흡수 촉진 정도로 답하면 됩니다", hoursOffset: 2 },
      { content: "괴혈병은 기출 아니라는데 신유형으로 나오니까 포기하지 말고 같이 외워두세요", hoursOffset: 5 },
    ],
  },
  {
    title: "MET랑 EPOC 정의 차이 정리해 주세요",
    content: "MET랑 EPOC 둘 다 나온다는데 자꾸 섞여요. MET가 1이면 안정상태 맞나요? EPOC는 운동 후 산소 소비 관련이고요?",
    date: "2026-06-20 21:50:00",
    comments: [
      { content: "MET는 운동·활동 강도를 숫자로 표현한 지표로, 안정 시 1 MET를 기준으로 몇 배의 에너지를 쓰는지 나타냅니다", hoursOffset: 1 },
      { content: "EPOC는 운동 후 안정 시 상태보다 산소 소비량이 더 많은 상태(초과산소소비)예요. 둘은 다른 개념입니다", hoursOffset: 2 },
    ],
  },
  {
    title: "크레아틴 한 번만 정리해 주실 분 (BCAA랑 헷갈림)",
    content: "구술에서 크레아틴 답하다가 BCAA처럼 얘기해버려서 심사위원이 갸우뚱하셨어요 ㅠ 크레아틴이 뭐고 어떤 에너지 시스템에 쓰이는지 깔끔하게 알고 싶어요.",
    date: "2026-06-20 21:54:00",
    comments: [
      { content: "크레아틴은 간과 신장에서 합성되거나 음식으로 섭취하는 유기화합물이에요. ATP-PC(인원질) 시스템에서 ATP 재합성에 쓰입니다", hoursOffset: 1 },
      { content: "크레아틴 인산이 분해되면서 아데노신을 ATP로 재합성하는 거예요. 단백질 보충제(BCAA)랑은 역할이 달라요", hoursOffset: 2 },
      { content: "인원질 시스템에 사용되니까 단시간 고강도 운동 초반 에너지원으로 외우면 안 헷갈립니다", hoursOffset: 4 },
    ],
  },
  {
    title: "트레이닝의 원리 6가지 정확한 답 (과부하·점진성·반복성·개별성·특이성·다양성)",
    content: "트레이닝 원리 물어보면 과부하·점진성까지는 나오는데 나머지가 자꾸 막혀요. 정확한 6가지 키워드 좀 알려주세요.",
    date: "2026-06-21 09:30:00",
    comments: [
      { content: "과부하·점진성·반복성·개별성·특이성·다양성 6가지입니다. '과점반개특다'로 외우면 편해요", hoursOffset: 1 },
      { content: "개인성(개별성)·특이성 순서 바뀌어도 키워드만 맞으면 점수 줍니다", hoursOffset: 2 },
    ],
  },
  {
    title: "카테콜아민이 심박수에 미치는 영향 (에피네프린·노르에피네프린)",
    content: "근력운동 시 심박수 영향 요소로 카테콜아민이 나왔어요. 카테콜아민이 정확히 뭐고 어떻게 답하면 되나요?",
    date: "2026-06-21 12:22:00",
    comments: [
      { content: "카테콜아민은 교감신경 활성화로 분비되는 에피네프린·노르에피네프린·도파민을 통칭해요. 심박수·혈압 상승, 기관지 확장 같은 효과로 운동 시 동원됩니다", hoursOffset: 1 },
      { content: "부신 수질에서 분비되는 호르몬이라는 점도 같이 답하면 좋아요", hoursOffset: 2 },
    ],
  },
  {
    title: "췌장 호르몬 글루카곤 vs 인슐린 (알파/베타·혈당 조절)",
    content: "글루카곤 생성과정이랑 인슐린 작용을 같이 물어봤는데 헷갈렸어요. 췌장 어디서 나오고 혈당을 어떻게 조절하는지 정리 부탁드려요.",
    date: "2026-06-21 12:07:00",
    comments: [
      { content: "글루카곤은 췌장 알파세포에서 분비, 글리코겐을 분해해 혈당을 올려요. 인슐린은 베타세포에서 분비, 혈중 포도당을 세포 안으로 이동시켜 혈당을 안정시킵니다", hoursOffset: 1 },
      { content: "글루카곤(알파)/인슐린(베타) 서로 반대작용이라고 묶어서 외우면 안 헷갈려요", hoursOffset: 2 },
    ],
  },
  {
    title: "근수축 기전 (활동전위 → 칼슘이온 → 액틴/마이오신 활주설)",
    content: "구술에서 근수축이 일어나는 과정을 설명하라는데, 마이오신이 액틴으로 미끄러지듯 어쩌구 하다가 막혔어요. 활동전위부터 순서대로 정리해 주실 분 계실까요?",
    date: "2026-06-21 22:20:00",
    comments: [
      { content: "신경 자극이 가로세관으로 이동 후 근형질세망에서 칼슘이온이 방출됩니다. 칼슘이온이 트로포닌과 결합해 트로포마이오신 위치를 이동시키고, 액틴의 마이오신 결합부위가 노출돼요. 액틴·마이오신이 결합해 안쪽으로 끌어당기면서 근수축이 발생합니다", hoursOffset: 1 },
      { content: "아세틸콜린 → 활동전위 → 칼슘 방출 → 트로포닌 결합 → 활주설 순서로 외우면 빠짐없이 답할 수 있어요", hoursOffset: 2 },
    ],
  },
  {
    title: "포도당 수송체(GLUT4) 나오면 어떻게 답하나요",
    content: "후기에 글루트4(포도당 수송체) 질문이 나왔다는데 머리가 하얘졌어요. 포도당 수용체 나오면 GLUT4로 말하면 끝인가요? 정확한 작용 좀 알려주세요.",
    date: "2026-06-21 10:40:00",
    comments: [
      { content: "근육과 지방에 있는 GLUT4가 식사 후 인슐린 분비나, 운동 중 근육 수축으로 활성화돼 혈중 포도당을 세포 안으로 흡수하게 합니다", hoursOffset: 1 },
      { content: "포도당 수송체 = GLUT4로 답하면 돼요. 규칙적 운동만으로도 GLUT4 활성도가 올라 인슐린 감수성이 좋아진다는 점도 덧붙이면 좋아요", hoursOffset: 2 },
    ],
  },
  {
    title: "운동단위(motor unit)랑 근력 결정 요인",
    content: "심사위원이 운동단위에 대해 말해보라는데 정확한 정의를 못 했어요. 운동단위가 뭐고 근력을 결정하는 요인은 뭔지 같이 정리하고 싶어요.",
    date: "2026-06-21 20:44:00",
    comments: [
      { content: "운동단위는 하나의 운동신경과 그 신경이 지배하는 근섬유들을 말해요. 근섬유 단면적, 운동단위 동원과 발화빈도 같은 신경계 요인, 근섬유 유형, 관절 각도와 지렛대 조건, 기술·피로 상태가 근력에 영향을 줍니다", hoursOffset: 1 },
      { content: "근력 = 근육 크기(단면적) + 신경계 동원이 핵심이라고 묶으면 키워드 다 들어가요", hoursOffset: 2 },
    ],
  },
  {
    title: "뼈의 기능 5가지 어떻게 답하나요",
    content: "구술에서 뼈의 기능을 물어봤는데 지지밖에 생각이 안 났어요. 조혈·저장 이런 것까지 포함해서 정리해 주실 분 계실까요?",
    date: "2026-06-22 23:04:00",
    comments: [
      { content: "조혈 기능, 신체 지지, 움직임(지렛대), 칼슘·인 저장, 장기 보호 5가지로 답하면 됩니다", hoursOffset: 1 },
      { content: "골수에서 혈액을 만드는 조혈 기능 빼먹기 쉬운데 꼭 넣으세요", hoursOffset: 2 },
    ],
  },
  {
    title: "자비스트 신유형 20% - 구술카드 + 누적후기 학습법",
    content: "신유형이 이번에 약 20% 정도 된다는데 구술카드만 봐도 될까요? 신유형은 따로 어디서 확인하는지, 누적후기까지 봐야 하는지 학습 전략 공유 부탁드려요.",
    date: "2026-06-22 00:31:00",
    comments: [
      { content: "구술카드 다 보고 신유형 후기까지 봐야 안전해요. 신유형이 이제 거의 다 나와서 돌려막기 수준이라 후기 보면 커버됩니다", hoursOffset: 1 },
      { content: "기존 기출 80% + 신유형 20%라 생각하고, 모르는 키워드만 추가로 외우는 식으로 가면 효율적이에요", hoursOffset: 2 },
      { content: "역학·심리는 공식 몇 개랑 키워드만 잡으면 점수 잘 나와서 문과도 버리지 말고 챙기세요", hoursOffset: 5 },
    ],
  },
  {
    title: "보디빌딩 실기 당일 준비 - 머리 묶기·복장·주차장",
    content: "실기 당일 머리는 묶고 가는 게 나은가요? 복장은 반바지에 민소매면 되는지, 주차장은 얼마나 일찍 가야 하는지 다녀오신 분들 팁 좀 부탁드려요.",
    date: "2026-06-21 09:04:00",
    comments: [
      { content: "머리는 아래로 묶고 가세요. 벤치프레스 할 때 안 걸리적거립니다. 복장은 무릎 보이는 반바지+민소매 나시면 돼요", hoursOffset: 1 },
      { content: "너무 일찍 가면 주차장 차 안에서 대기하시는 게 나아요. 주차장에 러브버그가 엄청 많다고 하더라고요", hoursOffset: 2 },
      { content: "포즈 시연은 쿼터턴 무조건 오른쪽으로 도시고, '보디빌딩 N번 포즈' 명칭 말하면서 하시면 됩니다", hoursOffset: 5 },
    ],
  },
];

const newPosts = RAW_POSTS.map((raw, idx) => {
  const postAuthor = authorAt(idx);
  const ca = commentAuthors(postAuthor, raw.comments.length, idx);
  return {
    categoryId: 1,
    title: raw.title,
    content: raw.content,
    author: postAuthor,
    date: raw.date,
    comments: raw.comments.map((c, i) => ({ author: ca[i], content: c.content, hoursOffset: c.hoursOffset })),
  };
});

// ===== 검증 =====
function checks() {
  // 1: (title,content) unique
  const seen = new Set<string>();
  for (const p of newPosts) {
    const key = `${p.title}|||${p.content}`;
    if (seen.has(key)) throw new Error(`체크1 실패 - 중복: ${p.title}`);
    seen.add(key);
  }
  console.log(`✅ 체크1 — ${newPosts.length}개 게시글 unique`);
  // 2: cat=1
  for (const p of newPosts) if (p.categoryId !== 1) throw new Error(`체크2 실패 - cat≠1: ${p.title}`);
  console.log(`✅ 체크2 — 전부 cat=1(보디빌딩)`);
  // 3: 작성자≠댓글자, PREV(46/49) 겹침 X, 글 내 중복 X
  const authors = new Set(newPosts.map((p) => p.author));
  const commenters = new Set<string>();
  for (const p of newPosts) for (const c of p.comments) commenters.add(c.author);
  for (const a of authors) if (commenters.has(a)) throw new Error(`체크3 실패 - 작성자 ${a}가 댓글자에도`);
  const prev = new Set(PREV_POOLS);
  for (const a of authors) if (prev.has(a)) throw new Error(`체크3 실패 - 작성자 ${a} 이전(46/49) 풀 겹침`);
  for (const c of commenters) if (prev.has(c)) throw new Error(`체크3 실패 - 댓글자 ${c} 이전(46/49) 풀 겹침`);
  for (const p of newPosts) {
    const s = new Set<string>([p.author]);
    for (const c of p.comments) { if (s.has(c.author)) throw new Error(`체크3 실패 - "${p.title}" 글 내 ${c.author} 중복`); s.add(c.author); }
  }
  console.log(`✅ 체크3 — 작성자 ${authors.size}명 / 댓글자 ${commenters.size}명, 46·49차 풀과 안 겹침`);
  // 6: region
  for (let i = 0; i < 5; i++) if (!pickRegion().includes(" - ")) throw new Error("체크6 실패 - region 형식");
  console.log(`✅ 체크6 — pickRegion "광역시도 - 시군구"`);
}

async function main() {
  console.log(`\n=== 48차 시드 ${DRY_RUN ? "[DRY RUN]" : "[PROD INSERT]"} ===`);
  console.log(`게시글 ${newPosts.length}개 / 댓글 ${newPosts.reduce((s, p) => s + p.comments.length, 0)}개\n`);
  checks();
  if (DRY_RUN) { console.log(`\n=== DRY RUN 완료 ===\n`); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !KEY) throw new Error("SUPABASE env 누락");
  const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

  let postsInserted = 0, commentsInserted = 0; const ids: number[] = [];
  for (const post of newPosts) {
    const region = pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;
    const { data, error } = await supabase.from("posts").insert({
      category_id: post.categoryId, title: post.title, content: post.content, author: post.author,
      password: "__seed_community__", ip_address: "seed_community", region, tags: "기타", views, created_at: post.date,
    }).select("id").single();
    if (error || !data) { console.error(`❌ post insert 실패: ${post.title}`, error?.message); continue; }
    postsInserted++; ids.push(data.id);
    for (const c of post.comments) {
      const d = new Date(post.date); d.setHours(d.getHours() + c.hoursOffset);
      const { error: cErr } = await supabase.from("comments").insert({
        post_id: data.id, author: c.author, content: c.content,
        password: "__seed_community__", ip_address: "seed_community", created_at: d.toISOString(),
      });
      if (!cErr) commentsInserted++;
    }
    const { count } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", data.id);
    await supabase.from("posts").update({ comments_count: count ?? 0 }).eq("id", data.id);
  }
  console.log(`\n=== 48차 완료 === postsInserted=${postsInserted}, commentsInserted=${commentsInserted}`);
  console.log(`insertedIds: ${ids[0]} ~ ${ids[ids.length - 1]}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
