import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

import { REGION_GROUPS } from "@/app/lib/region-data";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 인구수 비례 지역 가중치 (광역시도 코드 기준)
const weightedRegionCodes = [
  "SEOUL", "SEOUL", "SEOUL", "SEOUL", "SEOUL",
  "GYEONGGI", "GYEONGGI", "GYEONGGI", "GYEONGGI", "GYEONGGI", "GYEONGGI",
  "BUSAN", "BUSAN", "BUSAN",
  "INCHEON", "INCHEON", "INCHEON",
  "DAEGU", "DAEGU",
  "DAEJEON", "DAEJEON",
  "GWANGJU", "GWANGJU",
  "GYEONGNAM", "GYEONGNAM",
  "GYEONGBUK", "GYEONGBUK",
  "CHUNGNAM", "CHUNGNAM",
  "JEONNAM",
  "JEONBUK",
  "CHUNGBUK",
  "GANGWON",
  "ULSAN",
  "SEJONG",
  "JEJU",
];

// "서울특별시 - 강남구" 형식의 지역 문자열 생성
function pickRegion(): string {
  const code = pick(weightedRegionCodes);
  const group = REGION_GROUPS.find((g) => g.code === code);
  if (!group) return "서울특별시 - 강남구";
  const sub = pick(group.subRegions);
  return `${group.name} - ${sub.name}`;
}

// 게시글 + 댓글 데이터
interface PostData {
  categoryId: number;
  title: string;
  content: string;
  author: string;
  date: string;
  comments: { author: string; content: string }[];
}

const posts: PostData[] = [
  // ===== 5차 시드: Part 3 시험 직후 반응 + 가채점 + 실기준비 (2026-04-18) =====

  // --- 시험 직후 난이도 반응 ---
  {
    categoryId: 1,
    title: "26년 필기 역대급 난이도 인정합니다",
    content:
      "18년부터 기출 다 풀어봤는데 이번 26년이 최고 난이도였어요.\n\n작년에도 어렵다 어렵다 했지만 올해는 차원이 다릅니다.\n\n시험장에서 나오면서 다들 묵묵히 나오더라구요.\n\n어렵다는 말도 안 나올 정도로 지렸습니다.\n\n기저귀 차고 갈걸 그랬네요 진짜로.",
    author: "마카롱달콤",
    date: "2026-04-18 12:15:00",
    comments: [
      { author: "크로플바삭", content: "ㅋㅋㅋ 기저귀 공감 저도 지렸습니다" },
      { author: "와플시럽맛", content: "18년부터 다 풀어봤는데 이번이 진짜 넘사벽이에요" },
      { author: "팬케이크맛", content: "작년도 어려웠는데 올해는 차원이 다르네요" },
    ],
  },
  {
    categoryId: 5,
    title: "시험장에서 울면서 풀었습니다 진짜로",
    content:
      "저 진짜 시험지 보고 울면서 풀었어요.\n\n기출 400점 넘게 맞았는데 실제 시험은 처음 보는 문제 투성이.\n\n모의고사도 90점대 나왔는데 시험장에서 멘탈이 완전 박살났습니다.\n\n마감 3분 전에 겨우 끝냈고 머리카락 뽑으면서 풀었어요 ㅠㅠ\n\n같은 경험 하신 분들 위로합니다.",
    author: "슈크림빵맛",
    date: "2026-04-18 13:35:00",
    comments: [
      { author: "소보로빵맛", content: "저도요 기출 8년치 평균 90 넘었는데 실전은 완전 다른 시험" },
      { author: "식빵토스트", content: "울면서 푸셨다니 ㅠㅠ 수고하셨어요 좋은 결과 있을거예요" },
      { author: "크림치즈빵", content: "성의있게 찍으려니 시간이 훌쩍 가더라구요" },
    ],
  },
  {
    categoryId: 1,
    title: "에듀윌 교재 본 의미가 없었습니다",
    content:
      "에듀윌로 공부했는데 나온 개념이 거의 없어요.\n\n사회학 교육학 심리학 체육사 윤리 다 봤는데\n\n에듀윌에서 나왔던 개념들이 시험에 안 나왔습니다.\n\n에듀윌 불태워야 할 것 같아요 진심으로.\n\n내년에는 헝그리스포츠로 바꿔야겠습니다.",
    author: "타코야키왕",
    date: "2026-04-18 12:12:00",
    comments: [
      { author: "오코노미야키", content: "에듀윌 저도 봤는데 나온게 거의 없어요 공감" },
      { author: "라멘한그릇", content: "헝그리는 그래도 꽤 많이 나온 것 같더라구요" },
      { author: "규동한그릇", content: "에듀윌 책에 없는 내용이 시험에 50%는 나온 느낌" },
    ],
  },
  {
    categoryId: 1,
    title: "사회학 그냥 다 찍었습니다",
    content:
      "사회학이 진짜 개어렵지 않았나요?\n\n저는 그냥 다 찍었어요 솔직히.\n\n사람 이름이 왜 이렇게 많이 나왔는지 모르겠고\n\n푸코 지라르 아렌트 홉스 처음 들어보는 이름도 있었어요.\n\n학자 알아서 어디에 쓸건데 이걸 왜 물어보는건지 ㅋㅋ",
    author: "꽈배기설탕",
    date: "2026-04-18 12:10:00",
    comments: [
      { author: "츄러스초코", content: "사회학 저도 다찍었어요 사람이름 외워서 뭐하나 싶음" },
      { author: "도넛글레이즈", content: "푸코는 책에 있었는데 지라르는 처음이었어요" },
      { author: "붕어빵팥맛", content: "학자이름 고르는 문제가 선넘었다고 생각합니다" },
      { author: "호두과자맛", content: "윤리도 미쳤는데 사회학이 더 심했음" },
    ],
  },
  {
    categoryId: 3,
    title: "모의고사 570점이었는데 실제 시험은 200점 예상",
    content:
      "모의고사에서 570점 나왔었는데요.\n\n실제 시험 보고 나니까 200점도 안 될 것 같습니다.\n\n기출에 맞는 문제가 거의 안 나왔어요.\n\n멘탈 개털려서 반포기 상태로 나머지 찍었습니다.\n\n모 아니면 도 아닐까요...",
    author: "푸딩카라멜",
    date: "2026-04-18 12:35:00",
    comments: [
      { author: "젤리곰귀여", content: "570에서 200은 좀 심하네요 ㅠㅠ 그래도 잘 되실거예요" },
      { author: "하리보곰맛", content: "기출 모의에 맞는 문제가 거의 안나온건 사실" },
    ],
  },
  {
    categoryId: 1,
    title: "헝그리스포츠로 공부한 후기 - 그래도 제일 나았음",
    content:
      "헝그리스포츠로 기출 분석하면서 공부했는데\n\n이번 시험에서 그래도 제일 많이 나온 것 같아요.\n\n에듀윌은 본 의미가 없다는 분들 많은데\n\n헝그리는 기출에서 설명 다 해줘서 개념이 잡힙니다.\n\n기출만 사도 되고 이론 강의도 괜찮았어요.\n\n내년 준비하시는 분들은 헝그리 추천드립니다.",
    author: "초코쿠키맛",
    date: "2026-04-18 12:50:00",
    comments: [
      { author: "버터쿠키맛", content: "헝그리 모의고사는 전체 중 틀린거 3개 정도였는데 실전은 ㅠㅠ" },
      { author: "오레오쿠키", content: "24년도에 헝그리로 합격했어요 올해도 추천" },
      { author: "마카다미아맛", content: "기출만으로 되는 시험이 아니었지만 그래도 제일 나았죠" },
    ],
  },
  {
    categoryId: 10,
    title: "장체 시험 특수체육론 제외 다 꽝입니다",
    content:
      "장애인스포츠지도사 시험 봤는데\n\n특수체육론 말고는 다 꽝이에요.\n\n장체도 초면인 문제들이 많았고\n\n특수체육론도 어렵다는 분들이 많더라구요.\n\n저는 특수체육론이 그나마 제일 나았는데\n\n나머지 과목이 발목을 잡았습니다.",
    author: "찹쌀떡고물",
    date: "2026-04-18 12:32:00",
    comments: [
      { author: "인절미콩맛", content: "저도 특수체육론만 자신있었어요 나머지는 찍기 수준" },
      { author: "송편깨맛좋", content: "장체 특체론도 어려웠습니다 다들 어떠셨나요" },
      { author: "경단팥소맛", content: "장체는 그냥 지렸습니다 기저귀 필수였어요" },
    ],
  },
  {
    categoryId: 1,
    title: "시험장에 시계가 없어서 시간 분배 망했어요",
    content:
      "3번째 시험이었는데 시계가 없는 고사장은 처음이었습니다.\n\n시간이 부족해서 답안이 밀리고 이런 적은 처음이에요.\n\n같은 고사장 다른 반은 시계가 있었다던데\n\n이건 제 실력 문제면 납득하겠는데\n\n이의제기 온라인으로 하고 왔습니다.",
    author: "카스테라촉촉",
    date: "2026-04-18 14:59:00",
    comments: [
      { author: "파운드케이크", content: "시계 없는건 진짜 심했다 어떻게 시계가 없을 수 있죠" },
      { author: "롤케이크맛", content: "같은 고사장인데 반마다 다른건 불공평하네요" },
      { author: "쉬폰케이크맛", content: "이의제기 하셔야 합니다 정당한 문제예요" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 직후 마라탕 조졌습니다",
    content:
      "시험 끝나고 바로 마라탕 조졌어요.\n\n인생이 더 맵습니다 시험보다.\n\n쐬주 한잔하고 자야겠어요.\n\n여러분 날씨라도 좋은게 어디에요.\n\n날씨는 좋은데 마음은 우중충하네요.",
    author: "붕어빵슈크림",
    date: "2026-04-18 12:20:00",
    comments: [
      { author: "타이야끼맛", content: "마라탕 좋은 선택이에요 매운걸로 스트레스 풀어야지" },
      { author: "잉어빵팥맛", content: "저도 쐬주 한잔 하러 갑니다 수고하셨어요" },
    ],
  },
  {
    categoryId: 7,
    title: "윤리 과락 걱정됩니다 35점 미만이면 탈락이죠",
    content:
      "윤리가 너무 어려웠어요.\n\n총점은 300점 넘을 것 같은데\n\n윤리 35점 이하면 과락으로 탈락이잖아요.\n\n과락 기준이 40점 미만인줄 알았는데\n\n평균 60점에 단일과목 40점 미만이 과락이라고 하네요.\n\n한강 가기 전에 채점은 해보고 가야겠습니다.",
    author: "단팥빵소복",
    date: "2026-04-18 12:20:00",
    comments: [
      { author: "크림빵촉촉", content: "윤리 과락 걱정되시면 채점 먼저 해보세요" },
      { author: "식빵잼바른", content: "평균 60 단일과목 40미만 과락 맞습니다" },
      { author: "밀크브레드", content: "300점 넘으면 괜찮지 않을까요 화이팅" },
    ],
  },
  {
    categoryId: 1,
    title: "가답안 3-4시에 공홈에서 공개된대요",
    content:
      "가답안이 3시에서 4시 사이에 체육회 홈페이지에 올라온다고 합니다.\n\n넉넉하게 4시쯤 확인하시면 좋을 것 같아요.\n\n채점하면서 피 말리는 시간이지만\n\n일단 밥 먹고 한숨 자고 보는게 나을 듯.\n\n다들 맘 편하게 식사하시고 쉬세요.",
    author: "바게트버터",
    date: "2026-04-18 12:32:00",
    comments: [
      { author: "치아바타맛", content: "3-4시 기다리기 피말려요 한숨 자면 됩니다" },
      { author: "포카치아맛", content: "가채점이고 나발이고 집가서 빨리 자야겠어요" },
    ],
  },
  {
    categoryId: 1,
    title: "GPT로 가채점 해봤는데 과목별 점수가 이상합니다",
    content:
      "챗GPT로 가채점했더니 사회 80 교육 75 심리 80 역학 95 윤리 90 나왔는데\n\n이거 믿을만 한건가요?\n\n제미나이는 또 다른 답을 알려주더라구요.\n\nGPT도 확신하는 정답이 오답이라고 몇개 얘기하고\n\n한 문제씩 물어봐도 답이 달라서 못 믿겠어요.\n\n답지 나올때까지 기다려야 할 것 같습니다.",
    author: "에클레어맛",
    date: "2026-04-18 14:47:00",
    comments: [
      { author: "마들렌버터", content: "AI는 정답이 확실하지 않아서 참고만 하세요" },
      { author: "피낭시에맛", content: "제미나이랑 GPT랑 답이 다른게 더 불안하네요" },
      { author: "카눌레바삭", content: "가답안 나오면 정확히 채점하세요 AI 믿지 마세요" },
    ],
  },
  {
    categoryId: 1,
    title: "기출에서 나온게 있나 싶을 정도였습니다",
    content:
      "기출문제 21년부터 달달 외우듯 풀었는데\n\n정작 실제 시험에서는 기출에서 나온게 있나 싶을 정도예요.\n\n아예 처음 보는 문제가 거짓말 조금 보태서 50%였습니다.\n\n선지도 기출이랑 너무 달라서 소거법도 안 통했어요.\n\n기출만으로 되는 시험이 아니었습니다.",
    author: "팥빙수한그릇",
    date: "2026-04-18 13:36:00",
    comments: [
      { author: "눈꽃빙수맛", content: "기출 의미없었다는거 완전 동의합니다" },
      { author: "망고빙수맛", content: "본적도 없는 내용이 나왔어요 책을 대충 본 것도 아닌데" },
      { author: "딸기빙수맛", content: "기출은 다시 풀때 내용을 숙지하는게 중요합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "시험장 옆자리 빌런 때문에 집중 못했어요",
    content:
      "옆자리 아저씨가 혼잣말을 계속 해서 미칠 뻔했습니다.\n\n감독관이 가서 제지하는데 한숨 쉬고 혼잣말 계속하고.\n\n뒷자리는 후후 바람 불고 옆자리는 다리 떨고 난리났어요.\n\n시험 볼 때도 땀나서 힘들었는데\n\n주변 환경까지 안 좋으니 멘탈이 두배로 털렸습니다.",
    author: "솜사탕핑크",
    date: "2026-04-18 13:11:00",
    comments: [
      { author: "목화솜달콤", content: "겁나 빌런이네 지라르로 응수하시지 ㅋㅋ" },
      { author: "구름솜달달", content: "저도 앞자리가 계속 한숨 쉬어서 힘들었어요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영강사 꿈이 멀어졌습니다",
    content:
      "다들 시험 보고 수영강사의 꿈이 가까워지셨나요?\n\n저는 수영강사 안 하고 말지 싶은 심정입니다.\n\n찍신이여 나에게 오라 빌고 있어요.\n\n보통 한번에 합격을 못하는 시험인건지\n\n내년까지 한번 더 도전하고 안되면 접으려구요.",
    author: "아이스크림콘",
    date: "2026-04-18 12:19:00",
    comments: [
      { author: "바닐라소프트", content: "저도 같은 심정이에요 수영강사 꿈이 흔들립니다" },
      { author: "초코소프트", content: "한번에 합격 못해도 괜찮아요 내년에 다시 도전하세요" },
      { author: "딸기소프트", content: "아까의 내가 잘 풀었을테니 스트레스 받지 마세요" },
      { author: "민트소프트맛", content: "찍은 부분이 맞을 수도 있으니 가채점 해보세요" },
    ],
  },
  {
    categoryId: 1,
    title: "사양지심 답 예(禮) 맞습니다 - 맹자 사단 정리",
    content:
      "사양지심 문제 많이들 헷갈리셨죠?\n\n결론부터 말씀드리면 사양지심은 예(禮)가 맞습니다.\n\n맹자의 사단 개념 정리해드릴게요.\n\n측은지심 → 인(仁)\n수오지심 → 의(義)\n사양지심 → 예(禮)\n시비지심 → 지(智)\n\n사양지심은 남에게 양보하고 겸손해하는 마음으로 예의의 근본입니다.",
    author: "카라멜마끼아또",
    date: "2026-04-18 13:10:00",
    comments: [
      { author: "바닐라라떼맛", content: "예랑 의 중에서 개큰 고민했는데 예가 맞군요" },
      { author: "헤이즐넛라떼", content: "왜 의리가 생각났는지 모르겠어요 제대로 공부 안한 탓" },
      { author: "카페모카향긋", content: "이거 외울때 권력-푸틴으로 외웠어요 ㅋㅋ" },
    ],
  },
  {
    categoryId: 1,
    title: "합격했습니다!! 가채점 결과 공유",
    content:
      "가채점 했는데 합격이에요!!\n\n아악 너무 행복합니다 아름다운 하루입니다.\n\n시험장에서 한숨만 가득이었는데\n\n막상 채점해보니 생각보다 맞은게 있더라구요.\n\n다들 좋은 결과 있길 바랍니다!",
    author: "딸기케이크층",
    date: "2026-04-18 15:57:00",
    comments: [
      { author: "블루베리타르트", content: "축하드려요!! 고생하셨어요" },
      { author: "체리파이한조각", content: "부럽습니다 ㅠㅠ 저는 290인데 복수정답 제발요" },
      { author: "레몬타르트맛", content: "합격 진심 축하드려요 실기도 화이팅" },
    ],
  },
  {
    categoryId: 1,
    title: "295점인데 복수정답 되면 합격인데... 가능성 있나요",
    content:
      "가채점 결과 295점 나왔습니다.\n\n복수정답 처리되면 합격인데 가능성 있을까요?\n\n매년 이의신청으로 복수정답 처리되는 경우가 있다고 하는데\n\n22년부터 25까지 기출 풀어보니 중복정답이 한 네다섯번 있었어요.\n\n일단 295니까 실기 준비도 병행하려구요.",
    author: "티라미수겹겹",
    date: "2026-04-18 17:21:00",
    comments: [
      { author: "판나코타맛", content: "295면 가능성 있어요 논란 문제가 몇개 있거든요" },
      { author: "푸딩부드러운", content: "매년 1과목만 중복답안 있다고 치면 가능성 있습니다" },
      { author: "무스케이크맛", content: "일단 300이라 생각하고 실기 준비하세요" },
      { author: "젤라또부드러", content: "중복정답 되면 알아서 점수 올라가니까 실기 집중하세요" },
    ],
  },
  {
    categoryId: 1,
    title: "이의신청 기간에 꼭 제출하세요 - 논란 문제 정리",
    content:
      "논란 있는 문제들 정리해봤습니다.\n\n사회학 19번, 교육학 8번, 교육학 17번, 체육사 4번, 윤리 16번\n\n이 중에서 확실히 이의제기 받아들여질만한 문제가 있는지는 모르겠지만\n\n올해 시험이 어렵고 복잡해서 이의신청 엄청 할 것 같습니다.\n\n295점 분들은 꼭 이의신청 하세요.",
    author: "크레페딸기��",
    date: "2026-04-18 17:22:00",
    comments: [
      { author: "갈레트버터맛", content: "정리 감사합니다 이의신청 필수죠" },
      { author: "밀크크레페맛", content: "논란 문제들만 골라 틀렸는데 가능성 있지 않을까요" },
      { author: "바나나크레페", content: "이미 제출된 시험이니 이의신청 하시고 실기 준비합시다" },
    ],
  },
  {
    categoryId: 1,
    title: "모의고사 만점급이었는데 오늘 시험지 보면서 토할뻔",
    content:
      "모의고사 거의 다 만점에 가까웠는데\n\n오늘 시험지 보면서 토할 뻔했어요.\n\n당연히 맞았다 생각한 것들도 틀렸네요.\n\n문제풀이 볼 의욕까지 사라졌습니다.\n\n가답안이 잘못된줄 알았어요 진짜로.",
    author: "허니브레드맛",
    date: "2026-04-18 17:14:00",
    comments: [
      { author: "갈릭브레드맛", content: "만점급에서 이정도면 진짜 역대급 난이도 맞네요" },
      { author: "마늘빵바삭맛", content: "가답안 잘못된줄 아셨다니 ㅠㅠ 공감합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "출제자가 바뀌었나요? 핵심 문제 다 비껴감",
    content:
      "올해 시험 출제자가 바뀐건지 의심됩니다.\n\n핵심 문제가 다 비껴간 느낌이에요.\n\n에듀윌 기출 문제은행식이라고 했는데\n\n문제은행이 아닌 것 같더라구요.\n\n애보트 스위치가 누군데요 그래서 ㅋㅋ\n\n짐 애보트는 무슨 로봇청소기 새끼도 아니고.",
    author: "크림브륄레맛",
    date: "2026-04-18 17:25:00",
    comments: [
      { author: "플랑한조각", content: "ㅋㅋㅋ 로봇청소기 애보트 공감 처음 들어봤어요" },
      { author: "타르트타탕맛", content: "출제자 바뀐거 맞는 것 같아요 경향이 완전 달라짐" },
      { author: "수플레치즈맛", content: "핵심키워드가 계속 추가되는 느낌이었어요" },
    ],
  },
  {
    categoryId: 1,
    title: "4번이 유난히 많아서 불안했던 분 저만 그런가요",
    content:
      "시험 보면서 4번이 유난히 많이 나왔는데\n\n저만 그랬나요? 44444 나오길래 수정했어요.\n\n4랑 1이 좀 많았는데 불안해서 중간에 바꿨습니다.\n\nOMR 마킹할 때 3번 확인했어요.\n\n결과가 어떻게 나올지 모르겠지만 ㅋㅋ",
    author: "와사비맛간장",
    date: "2026-04-18 12:11:00",
    comments: [
      { author: "간장게장맛좋", content: "저도 4번 연속이라 수정했어요 ㅋㅋ 불안한 마음 공감" },
      { author: "양념게장매콤", content: "4랑 1이 많았다는거 동의합니다" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 실기 준비 어떻게 시작해야 하나요",
    content:
      "필기 합격하면 바로 실기인데\n\n수영은 어떻게 실기 준비하나요?\n\nIM 100도 안 해봤는데 이제 시작해야 하나요.\n\n수린이사이트에서 정보 보고 있는데\n\n수영장 가서 냅다 연습 갈기려구요.\n\n천천히 길게 하는거 연습중입니다.",
    author: "참치마요김밥",
    date: "2026-04-18 15:52:00",
    comments: [
      { author: "불고기김밥맛", content: "수영연맹 교본이 구술 기본이에요 꼭 보세요" },
      { author: "치즈김밥좋아", content: "수린이사이트 진짜 도움 많이 됩니다 추천" },
      { author: "참치주먹밥맛", content: "배영 벽받기 확실히 하면 기록 단축에 도움돼요" },
      { author: "새우김밥한줄", content: "생체수영은 기록이 헬 장체는 구술이 헬이에요" },
    ],
  },
  {
    categoryId: 1,
    title: "보디빌딩 실기/구술 정보 아시는 분 계신가요",
    content:
      "필기는 어떻게든 된 것 같은데\n\n보디빌딩 실기/구술 정보가 너무 없어요.\n\n책은 있는데 실제 어떤 식으로 진행되는지 모르겠습니다.\n\n필기 실기 구술 연수 다 중요하다고 하는데\n\n하나라도 무시했다간 탈락이라네요.\n\n정보 공유해주실 분 있으신가요?",
    author: "떡갈비양념맛",
    date: "2026-04-18 15:56:00",
    comments: [
      { author: "갈비찜한접시", content: "교본 꼭 보세요 제일 중요합니다" },
      { author: "불갈비소스맛", content: "구술은 완벽 암기해서 또박또박 답하는게 좋아요" },
      { author: "양념갈비향긋", content: "구술 4개 나오는걸로 알고 있습니다 부분점수도 있어요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 구술은 어디서 준비하나요? 자료 있나요",
    content:
      "생체 구술은 어디서 준비하나요?\n\n자료가 있는지 모르겠어요.\n\n수영연맹 교본이 기본이라는데\n\n거기에 족보 조합해서 공부하면 된다고 하네요.\n\n구술 질문 3개인데 하나에 33점 정도로 보면 된다는데\n\n80점이 합격선이라 2.5개는 맞춰야 합니다.",
    author: "순대국밥뜨끈",
    date: "2026-04-18 15:54:00",
    comments: [
      { author: "설렁탕맑은맛", content: "교본 꼭 보세요 기본 중의 기본입니다" },
      { author: "곰탕진한맛좋", content: "방장님이 올려놓으신 사이트 들어가보세요" },
    ],
  },
  {
    categoryId: 1,
    title: "어제 분리수거장에 책 버렸는데 다시 주우러 가야하나",
    content:
      "시험 전날 자신감 넘쳐서\n\n분리수거장에 책 다 버렸거든요.\n\n근데 시험 보고 나니까 다시 주우러 가야할 것 같아요.\n\n내년 대비해야 할 수도 있으니까요 ㅋㅋ\n\n아 진짜 자신감이 과했습니다.",
    author: "고로케크림맛",
    date: "2026-04-18 12:55:00",
    comments: [
      { author: "카레빵커리맛", content: "ㅋㅋㅋ 분리수거장에서 건져야겠네요" },
      { author: "소시지빵맛좋", content: "자신감 과하셨군요 ㅋㅋ 그래도 잘 되실거예요" },
      { author: "크림빵슈크림", content: "채점부터 해보세요 의외로 합격일 수도" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 중에 뇌가 수축되는 느낌 드신 분",
    content:
      "혹시 시험 보면서 뇌가 수축되는 느낌 드신 분 계신가요?\n\n아무렇지 않은 척 보고 아무렇지 않은 척 하는데\n\n뇌는 수축되는 느낌이네요.\n\n문제은행식이라매 하고 여친한테 혼났습니다.\n\n나오자마자 욕먹었어요 ㅋㅋ",
    author: "호떡시나몬맛",
    date: "2026-04-18 13:11:00",
    comments: [
      { author: "꿀떡달달한맛", content: "ㅋㅋㅋ 여친한테 혼나셨다니 공감됩니다" },
      { author: "찰떡콩맛좋아", content: "뇌 수축 공감 저도 시험 끝나고 멍했어요" },
      { author: "백설기촉촉맛", content: "문제은행식 아닙니다 ㅋㅋ 매년 새로운 문제예요" },
    ],
  },
  {
    categoryId: 1,
    title: "기출 분석보다 개념 숙지가 더 중요했네요",
    content:
      "이번 시험 보고 느낀 점은\n\n기출 분석을 하되 개념이 더 중요하다는 거예요.\n\n기출에서 맞추는게 의미가 없고\n\n곁가지로 더 뻗쳐서 공부해야 합니다.\n\n핵심 키워드도 계속 추가되고 있어서\n\n이론만 계속 파는게 맞는 것 같아요.",
    author: "치킨양념간장",
    date: "2026-04-18 17:24:00",
    comments: [
      { author: "후라이드바삭", content: "기출만으로 되는 시험이 아니었다는거 동의합니다" },
      { author: "양념치킨매콤", content: "개념 숙지가 핵심이죠 기출은 그냥 방향잡기용" },
      { author: "간장치킨짭짤", content: "이론 파면서 기출 풀면 시너지가 나더라구요" },
    ],
  },
  {
    categoryId: 8,
    title: "태권도 실기 구술 먼저 보신 분 있나요",
    content:
      "필기 전에 실기를 먼저 보신 분이 계시더라구요.\n\n실기 미리 봐서 마음이 너무 편하다고 하시네요.\n\n필기 합격하고 나서 실기 구술 화이팅 하겠습니다.\n\n덕분에 붙었다는 분도 있고\n\n다들 실기 구술 준비 화이팅입니다.",
    author: "떡꼬치매콤달",
    date: "2026-04-18 15:53:00",
    comments: [
      { author: "어묵꼬치따끈", content: "실기 먼저 보면 확실히 여유가 생기더라구요" },
      { author: "닭꼬치양념맛", content: "필기 실기 구술 연수 다 중요해요 하나라도 무시하면 탈락" },
    ],
  },
  {
    categoryId: 1,
    title: "채점하면서 너무 많이 틀려서 당황했어요",
    content:
      "가답안 나와서 채점했는데\n\n이번에 정말 어려운 거 같아요.\n\n채점하면서 너무 많이 틀려서 당황했습니다.\n\n확신한 문제들도 틀렸고 찍은 문제는 당연히 틀렸고.\n\n올해 합격률이 궁금합니다 10%는 될까요.",
    author: "군고구마달콤",
    date: "2026-04-18 15:56:00",
    comments: [
      { author: "고구마라떼맛", content: "저도 확신한게 틀렸어요 가답안이 잘못된줄" },
      { author: "고구마칩바삭", content: "합격률 10%도 안 될 것 같은 분위기네요" },
      { author: "고구마맛탕맛", content: "의외로 합격자 많을 수도 있어요 35점이 45점 나올수있음" },
    ],
  },
  {
    categoryId: 1,
    title: "305점인데 최종답안에서 깎이는 경우는 없겠죠?",
    content:
      "가채점 305점 나왔는데\n\n혹시 최종답안에서 점수가 깎이는 경우는 없겠죠?\n\n올라가면 올라갔지 떨어지진 않는다고 하는데 맞나요?\n\n이의신청 기간 끝나고 최종답안 나오면\n\n복수정답으로 점수가 오를 수도 있다고 하네요.",
    author: "쫄면새콤달콤",
    date: "2026-04-18 17:22:00",
    comments: [
      { author: "비빔면매콤맛", content: "305면 안전권이에요 오르면 올랐지 떨어지진 않아요" },
      { author: "냉면시원한맛", content: "축하드려요 실기 준비하시면 됩니다" },
    ],
  },
  {
    categoryId: 19,
    title: "배드민턴 실기 심히 어렵습니다 준비 팁 있나요",
    content:
      "배드민턴 실기가 심하게 어렵다고 들었는데\n\n구체적으로 어떤 부분이 어려운가요?\n\n필기는 어떻게든 넘겼는데\n\n실기가 걱정됩니다.\n\n배평턴 경험 있으신 분 조언 부탁드려요.",
    author: "떡튀순한세트",
    date: "2026-04-18 15:52:00",
    comments: [
      { author: "순대곱창볶음", content: "실기는 기본기가 탄탄해야 해요 꾸준히 연습하세요" },
      { author: "떡볶이치즈맛", content: "교본 기준으로 준비하면 됩니다 완벽 암기 필수" },
    ],
  },
  {
    categoryId: 1,
    title: "필기 합격 인증! 오늘부터 실기 준비합니다",
    content:
      "이미 제출된 시험이니 이의신청 필요하신 분들은 하시고\n\n오늘부터 실기 준비합시다.\n\n이번 시험이 역대급이었지만\n\n결과가 나온 이상 앞만 보고 가야합니다.\n\n다들 실기 구술 화이팅!",
    author: "핫도그케찹맛",
    date: "2026-04-18 17:23:00",
    comments: [
      { author: "콘도그소스맛", content: "맞아요 이제 실기 준비 시작합시다 화이팅" },
      { author: "치즈핫도그맛", content: "앞만 보고 갑시다 다들 고생하셨어요" },
      { author: "감자핫도그맛", content: "실기 구술 연수까지 힘내봅시다" },
    ],
  },
  {
    categoryId: 1,
    title: "아파서 시험 못 간 사람입니다 내년에 봅니다",
    content:
      "독감 걸려서 시험 못 갔어요.\n\n병원 다녀오니 독감이네요.\n\n너무 아파서 못 가서 울었는데\n\n다들 반응 보니까 안 오시길 잘하셨다는 ㅋㅋ\n\n시험보러 오셨으면 쓰러지셨을 듯이라니\n\n그 정도였나요 ㅠㅠ 내년에 다시 도전합니다.",
    author: "핫초코달달맛",
    date: "2026-04-18 12:54:00",
    comments: [
      { author: "코코아포근맛", content: "건강이 먼저예요 내년에 화이팅하세요" },
      { author: "밀크티부드런", content: "오히려 안 가신게 나았을수도 ㅋㅋ 역대급이었거든요" },
    ],
  },
  {
    categoryId: 14,
    title: "축구 종목인데 시험 난이도 체감 공유",
    content:
      "축구 종목으로 시험 봤는데\n\n이번 난이도가 정말 역대급이었습니다.\n\n교육학이 너무 힘들었고\n\n기출이랑 선지가 너무 다르더라구요.\n\n16-25년 모의고사 7바퀴는 돌렸는데\n\n역대급이었습니다 진짜로.",
    author: "나초치즈소스",
    date: "2026-04-18 17:23:00",
    comments: [
      { author: "살사소스매콤", content: "교육학 진짜 힘들었죠 저도 축구인데 공감합니다" },
      { author: "과카몰리신선", content: "기출 7바퀴 돌려도 이정도면 진짜 난이도 문제" },
      { author: "타코시즈닝맛", content: "선지가 기출이랑 너무 달라서 소거법도 안통했어요" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 끝나고 용병 야구 가야하는데 공도 못던지겠음",
    content:
      "시험 끝나고 이따 용병 야구 가야하는데\n\n잠 못 자서 공도 못 던지겠네요.\n\n시험 볼 때도 땀나서 힘들었는데\n\n에듀윌 책 본 의미가 없어서 멘탈도 탈탈.\n\n피곤해 죽겠는데 야구는 가야하고\n\n인생이 왜 이런지 모르겠습니다.",
    author: "만두찐만두맛",
    date: "2026-04-18 12:54:00",
    comments: [
      { author: "교자만두바삭", content: "ㅋㅋㅋ 야구하러 가시는거 대단해요 쉬세요" },
      { author: "물만두육즙맛", content: "에듀윌 멘탈 탈탈 공감합니다 화이팅" },
    ],
  },
  {
    categoryId: 12,
    title: "역도 종목 실기 준비 시작합니다",
    content:
      "필기 넘긴 것 같으니 이제 역도 실기 준비입니다.\n\n장체 역도라서 구술이 헬이라고 하는데\n\n교본 기준으로 열심히 암기할 예정이에요.\n\n부분점수는 채점자마다 다르다고 하니\n\n완벽하게 암기하고 가겠습니다.",
    author: "짜장면곱빼기",
    date: "2026-04-18 15:53:00",
    comments: [
      { author: "짬뽕얼큰한맛", content: "역도 구술 화이팅 교본이 제일 중요합니다" },
      { author: "볶음밥황금맛", content: "완벽 암기가 답이에요 실기도 열심히 하세요" },
    ],
  },
];

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  let postsInserted = 0;
  let commentsInserted = 0;

  for (const post of posts) {
    const region = pickRegion();
    try {
      // 조회수 20~100 랜덤
      const randomViews = Math.floor(Math.random() * 81) + 20;

      // 게시글 삽입
      const result = await sql`
        INSERT INTO posts (category_id, title, content, author, password, region, tags, ip_address, created_at, updated_at, views)
        VALUES (${post.categoryId}, ${post.title}, ${post.content}, ${post.author}, ${"__seed_community__"}, ${region}, ${"기타"}, ${"seed_community"}, ${post.date}::timestamp, ${post.date}::timestamp, ${randomViews})
        RETURNING id
      `;
      postsInserted++;

      const postId = result[0]?.id;
      if (!postId) continue;

      // 댓글 삽입
      for (const comment of post.comments) {
        const commentDate = new Date(post.date);
        commentDate.setHours(
          commentDate.getHours() + Math.floor(Math.random() * 48) + 1
        );
        commentDate.setMinutes(Math.floor(Math.random() * 60));
        const commentDateStr = commentDate.toISOString();

        try {
          await sql`
            INSERT INTO comments (post_id, author, password, content, ip_address, created_at)
            VALUES (${postId}, ${comment.author}, ${"__seed_community__"}, ${comment.content}, ${"seed_community"}, ${commentDateStr}::timestamp)
          `;
          commentsInserted++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`Comment insert failed:`, msg);
        }
      }

      // comments_count 업데이트
      await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${postId}) WHERE id = ${postId}`;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Post insert failed: ${post.title}`, msg);
    }
  }

  return NextResponse.json({
    success: true,
    postsInserted,
    commentsInserted,
  });
}
