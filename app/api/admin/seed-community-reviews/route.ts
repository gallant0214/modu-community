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
  // ===== 2차 시드: 시험 후 반응, AI채점, 가답안, 복수정답, 합격률 등 =====

  // ===== 보디빌딩 (categoryId: 1) =====
  {
    categoryId: 1,
    title: "가답안 채점 결과 295점인데 합격 가능할까요?",
    content:
      "가답안 나와서 채점해봤는데 295점입니다.\n\n평균 60점 넘기려면 300점이어야 하는데 5점 모자라네요.\n\n복수정답 인정되면 올라갈 수도 있다는데... 혹시 복수정답 나온 적 있는 분 계신가요?\n\n교육학에서 2문제 정도 애매한 게 있어서 이의신청 하려고 합니다.\n\n295~305점 사이 분들 많으실 것 같은데 다들 어떠세요?",
    author: "295점불안",
    date: "2026-04-18 14:22:00",
    comments: [
      { author: "같은처지", content: "저도 300점인데 복수정답 기대하고 있어요 ㅠ" },
      { author: "작년경험", content: "작년에 복수정답 2개 인정됐었습니다. 올해도 기대해보세요!" },
      { author: "합격선배", content: "이의신청 꼭 하세요. 결과 바뀌는 경우 많습니다" },
    ],
  },
  {
    categoryId: 1,
    title: "AI채점 vs 수기채점 결과가 다르다는데 신뢰할 수 있나요?",
    content:
      "올해부터 AI채점이 도입됐다고 하는데 정확도가 어떤지 궁금합니다.\n\n주변에서 AI채점 결과랑 직접 채점한 결과가 1~2문제 차이 난다는 분도 계시더라고요.\n\n마킹을 연하게 해서 인식이 안 됐을 수도 있고... 걱정이 많네요.\n\n혹시 이의신청하면 수기로 다시 채점해주나요?",
    author: "AI채점의문",
    date: "2026-04-18 15:10:00",
    comments: [
      { author: "정보통", content: "AI채점은 OMR 인식률이 99.9%라서 거의 정확합니다" },
      { author: "마킹주의", content: "컴사인펜으로 진하게 마킹해야 인식률이 높아요" },
      { author: "작년응시자", content: "이의신청하면 재채점해줍니다. 걱정 마세요!" },
    ],
  },
  {
    categoryId: 1,
    title: "복수정답 이의신청 방법 정리 (경험담)",
    content:
      "복수정답 이의신청 해본 경험 공유합니다.\n\n체육지도자 홈페이지에서 이의신청 기간에 신청 가능합니다.\n\n신청할 때 근거 자료를 첨부하면 인정 확률이 높아져요.\n교재 페이지 캡처나 논문 인용 등을 같이 올리세요.\n\n작년에 교육학 1문제, 체육사 1문제가 복수정답으로 인정됐었습니다.\n\n이번에도 교육학 러닝스테이 문제가 복수정답 가능성이 있다고 봅니다.",
    author: "이의신청경험자",
    date: "2026-04-18 16:30:00",
    comments: [
      { author: "희망이보인다", content: "근거 자료 첨부 팁 감사합니다! 바로 준비해볼게요" },
      { author: "교육학과락", content: "러닝스테이 문제 복수정답 인정되면 과락 면할 수 있는데..." },
      { author: "매년있음", content: "복수정답은 매년 1~3개 정도 나옵니다. 포기하지 마세요" },
    ],
  },
  {
    categoryId: 1,
    title: "305점 나왔는데 안심해도 될까요?",
    content:
      "가답안 채점 305점입니다.\n\n과목별로 보면 교육학 52점, 체육사 68점, 심리 72점, 윤리 60점, 사회학 53점이에요.\n\n교육학이 과락(40점) 걱정됐는데 다행히 넘겼네요.\n\n근데 가답안이랑 정답이 다를 수도 있다고 해서 불안합니다.\n\n가답안에서 정답 바뀐 적 있나요?",
    author: "305점안심",
    date: "2026-04-18 14:55:00",
    comments: [
      { author: "축하해요", content: "305점이면 충분합니다! 축하드려요" },
      { author: "경험담", content: "가답안에서 정답 바뀌는 경우는 거의 없어요. 안심하셔도 됩니다" },
      { author: "부러워요", content: "교육학 52점이면 잘 보신 거예요. 저는 36점... ㅠ" },
    ],
  },
  {
    categoryId: 1,
    title: "올해 합격률 어떻게 될 것 같으세요?",
    content:
      "이번 시험 난이도가 역대급이었잖아요.\n\n보통 어려운 해는 합격률이 30%대로 떨어지는데 올해는 20%대까지 갈 수도 있을 것 같습니다.\n\n17년도가 28%로 역대 최저였는데 그때보다 더 어려웠다는 의견도 있더라고요.\n\n합격률이 낮으면 실기 경쟁이 덜 치열해지니 그건 장점이긴 한데...\n\n다들 합격률 예상 어떻게 보시나요?",
    author: "합격률예측",
    date: "2026-04-18 17:20:00",
    comments: [
      { author: "통계마니아", content: "체감 난이도 기준 25~30% 정도로 예상합니다" },
      { author: "낙관론자", content: "의외로 커브가 있을 수 있어요. 35%는 될 것 같습니다" },
      { author: "현실파", content: "주변에 과락 예상하는 분이 많아서... 20%대 각오하세요" },
      { author: "실기준비중", content: "합격률 낮으면 실기 인원이 줄어서 오히려 좋은 건가..." },
    ],
  },

  // ===== 축구 (categoryId: 2) =====
  {
    categoryId: 2,
    title: "교육학 과락 40점 미만이면 전과목 불합격인 거 맞죠?",
    content:
      "교육학 채점해보니 36점밖에 안 나왔습니다.\n\n과락 기준이 각 과목 40점 이상인데, 하나라도 40점 미만이면 총점이 높아도 불합격인 거 맞나요?\n\n다른 과목은 70점대인데 교육학 하나 때문에...\n\n복수정답 인정되면 40점 넘을 수 있는데 간절합니다.",
    author: "과락위기",
    date: "2026-04-18 15:33:00",
    comments: [
      { author: "안타깝네요", content: "네 맞습니다. 한 과목이라도 40점 미만이면 불합격이에요 ㅠ" },
      { author: "같은상황", content: "저도 교육학 38점인데... 복수정답 기도 중입니다" },
      { author: "내년화이팅", content: "내년에는 교육학에 더 시간 투자하세요. 이론서 정독 필수입니다" },
    ],
  },
  {
    categoryId: 2,
    title: "시험 끝나고 가답안 어디서 확인하나요?",
    content:
      "시험 끝나고 가답안을 확인하려는데 어디서 볼 수 있나요?\n\n체육지도자 공식 사이트에서 올라온다고 들었는데 몇 시에 올라오는지 궁금합니다.\n\n시험지를 가져왔는데 가답안이랑 대조하려면 시험지에 답을 체크해와야 했는데...\n\n혹시 시험지에 답 안 적어오신 분들은 어떻게 하세요?",
    author: "가답안확인",
    date: "2026-04-18 13:15:00",
    comments: [
      { author: "정보공유", content: "체육지도자 홈페이지에서 당일 오후 2~3시에 올라옵니다" },
      { author: "시험지필수", content: "시험지에 답 체크하는 게 필수예요. 다음부터 꼭 하세요!" },
      { author: "앱으로도", content: "퍼스트펭귄 앱에서도 가답안 바로 확인 가능합니다" },
    ],
  },

  // ===== 요가필라테스 (categoryId: 3) =====
  {
    categoryId: 3,
    title: "건강운동관리사 vs 생활체육지도사 2급 뭐가 더 좋은가요?",
    content:
      "진로 고민 중인데 건강운동관리사랑 생활체육지도사 2급 중 어떤 게 더 활용도가 높을까요?\n\n건운사는 의료기관 취업이 가능하고, 생체2급은 체육시설 취업에 유리하다고 들었어요.\n\n난이도는 건운사가 훨씬 어렵다고 하는데... 투자 대비 효과가 어떤지 궁금합니다.\n\n두 개 다 가지고 계신 분 있으시면 조언 부탁드려요!",
    author: "진로고민중",
    date: "2026-04-15 20:40:00",
    comments: [
      { author: "건운사보유", content: "건운사는 병원 취업 가능하지만 자리가 많지 않아요. 생체가 범용성 좋습니다" },
      { author: "양쪽다있음", content: "둘 다 있으면 이력서에 좋긴 한데, 하나만 고르라면 생체2급 추천합니다" },
      { author: "현실적으로", content: "PT 하실 거면 생체2급이 필수이고 건운사는 옵션입니다" },
    ],
  },
  {
    categoryId: 3,
    title: "필기 교육학에서 '러닝스테이'가 뭔지 아시는 분?",
    content:
      "오늘 시험에서 러닝스테이라는 용어가 나왔는데 처음 봤습니다.\n\n교재에도 없고 기출에서도 본 적이 없는데...\n\n혹시 아시는 분 계시면 설명 부탁드립니다.\n\n이런 생소한 용어가 나오면 어떻게 대비해야 하는 건지 모르겠어요.\n\n전공 서적을 봐야 하나요?",
    author: "러닝스테이뭐야",
    date: "2026-04-18 12:20:00",
    comments: [
      { author: "체교과전공", content: "Learning Station이라고 순환학습 스테이션 모형입니다. 전공서적에 나와요" },
      { author: "나도처음", content: "저도 처음 봤어요. 기출만으로는 한계가 있네요" },
      { author: "공부범위", content: "올해부터 전공 수준 문제가 나오기 시작한 것 같아요..." },
    ],
  },

  // ===== 테니스 (categoryId: 4) =====
  {
    categoryId: 4,
    title: "시험 직후 멘탈 관리법 공유합니다",
    content:
      "시험 끝나고 멘탈 나간 분들 많으실 것 같아서 글 씁니다.\n\n가답안 채점 결과에 너무 일희일비하지 마세요.\n\n복수정답도 있고, 가답안이 최종 정답이 아닌 경우도 있습니다.\n\n저도 작년에 가답안 기준 불합격이었는데 최종 합격했거든요.\n\n일단 결과 나올 때까지 실기 준비에 집중하는 게 낫습니다.\n\n어차피 필기 합격하면 바로 실기 일정이 다가오니까요.",
    author: "멘탈관리사",
    date: "2026-04-18 18:05:00",
    comments: [
      { author: "위로감사", content: "이런 글 정말 필요했어요. 감사합니다 ㅠㅠ" },
      { author: "작년합격자", content: "맞아요 가답안이 다가 아닙니다. 결과 기다려보세요!" },
      { author: "실기준비", content: "필기 결과 나오기 전에 실기 준비 시작하는 게 맞죠?" },
    ],
  },

  // ===== 수영 (categoryId: 5) =====
  {
    categoryId: 5,
    title: "가답안 320점인데 실기 준비 바로 시작해야 하나요?",
    content:
      "가답안 채점 320점이라 합격은 확실한 것 같은데요.\n\n실기 시험이 언제쯤 있는지, 지금부터 준비해야 하는지 궁금합니다.\n\n수영 IM 100m 기록이 현재 1분 50초인데 합격 기준이 어떻게 되나요?\n\n필기 합격 발표 전에 미리 수영장 등록하고 연습 시작해야 할까요?",
    author: "실기준비시작",
    date: "2026-04-18 16:45:00",
    comments: [
      { author: "선배조언", content: "지금 바로 시작하세요! 실기까지 시간이 많지 않습니다" },
      { author: "기록목표", content: "IM 1분30초 이내면 안정권이에요. 연습 화이팅!" },
      { author: "수영장추천", content: "50m 풀에서 스타트 연습 가능한 곳 찾아보세요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 접영 킥 연습할 때 돌핀킥이 안 돼요",
    content:
      "접영 배우는 중인데 돌핀킥이 너무 어렵습니다.\n\n코치님은 골반에서부터 웨이브가 나와야 한다고 하시는데, 무릎만 구부려지고 골반이 안 움직여요.\n\n유튜브 보면서 따라해봐도 물속에서는 완전 다르더라고요.\n\n혹시 돌핀킥 연습 팁 있으신 분 계신가요?\n\n킥보드 잡고 연습하라는데 그것도 잘 안 되네요 ㅠ",
    author: "접영초보",
    date: "2026-04-12 19:30:00",
    comments: [
      { author: "수영코치", content: "벽잡고 킥 연습 먼저 하세요. 골반 움직임 느끼는 게 먼저입니다" },
      { author: "접영마스터", content: "핀 끼고 연습하면 감각 잡기 좋아요. 추천합니다" },
      { author: "같은고민", content: "저도 3개월 걸렸어요. 꾸준히 하면 됩니다!" },
    ],
  },
  {
    categoryId: 5,
    title: "실기 시험장 수영장 수온이 차갑다는데 대비법 있나요?",
    content:
      "작년에 실기 본 분이 수영장 수온이 평소 연습하던 곳보다 차가웠다고 하더라고요.\n\n차가운 물에서는 근육이 굳어서 기록이 나빠질 수 있다는데...\n\n미리 차가운 물에서 연습하거나 워밍업을 충분히 하는 게 좋을까요?\n\n시험 전 워밍업 시간이 주어지나요?",
    author: "수온걱정",
    date: "2026-04-11 14:20:00",
    comments: [
      { author: "실기경험자", content: "워밍업 시간 있습니다. 미리 물에 들어가서 적응하세요" },
      { author: "기록영향", content: "수온이 낮으면 1~2초 정도 느려질 수 있어요. 여유 기록 만들어두세요" },
      { author: "대비법", content: "냉수 샤워 습관 들이면 도움 됩니다 ㅎㅎ" },
    ],
  },

  // ===== 골프 (categoryId: 6) =====
  {
    categoryId: 6,
    title: "이번 시험 체육사에서 배구 규칙 변천사가 나왔는데",
    content:
      "체육사 과목에서 배구 규칙 변천사 문제가 나왔어요.\n\n25점제에서 랠리포인트제로 바뀐 연도를 물어봤는데... 기억이 안 나더라고요.\n\n체육사는 연도 외우기가 진짜 중요한데 범위가 너무 넓어서 힘듭니다.\n\n일제강점기 체육단체 순서, 올림픽 개최 연도, 규칙 변경 연도...\n\n체육사 암기 팁 있으신 분 공유 부탁드립니다!",
    author: "체육사암기",
    date: "2026-04-18 13:40:00",
    comments: [
      { author: "연도정리", content: "노트에 시대별로 정리해서 매일 보면 외워집니다" },
      { author: "체육사마스터", content: "플래시카드 만들어서 외우는 게 효과적이에요" },
      { author: "같은문제", content: "저도 그 문제 틀렸어요 ㅠ 배구 규칙까지 외워야 하다니..." },
    ],
  },

  // ===== 농구 (categoryId: 7) =====
  {
    categoryId: 7,
    title: "시험 끝나고 같이 운동할 사람 구합니다 (서울)",
    content:
      "시험 끝났으니 운동이나 같이 하실 분 있나요?\n\n서울 강남 쪽에서 주로 운동하는데 실기 준비 겸 같이 하면 좋을 것 같아요.\n\n농구 좋아하는데 체력 훈련도 같이 할 수 있는 분이면 좋겠습니다.\n\n시험 스트레스도 풀 겸 운동합시다!",
    author: "운동메이트",
    date: "2026-04-18 19:00:00",
    comments: [
      { author: "강남운동", content: "저도 강남인데 같이 하고 싶어요! 연락 방법이 있나요?" },
      { author: "실기동반", content: "실기 준비 같이 하면 동기부여도 되고 좋죠" },
    ],
  },

  // ===== 배구 (categoryId: 8) =====
  {
    categoryId: 8,
    title: "2026 필기 과목별 체감 점수 공유합니다",
    content:
      "오늘 시험 과목별 체감 점수 공유합니다.\n\n교육학: 48점 (역대급 어려움, 처음 보는 용어 많았음)\n체육사: 60점 (이길용, 배구규칙 등 세부적인 문제 출제)\n심리학: 76점 (기본 개념 위주라 무난했음)\n윤리학: 68점 (카타르시스, 칸트 등 기본 문제)\n사회학: 56점 (사회자본, 일탈 관련 신유형 출제)\n\n총점 308점 예상인데 교육학이 과락 걱정입니다.\n40점 넘겼으면 좋겠는데...",
    author: "과목별분석",
    date: "2026-04-18 14:10:00",
    comments: [
      { author: "비슷해요", content: "저도 교육학 50점대인데 과락만 면하면 될 것 같아요" },
      { author: "심리선택잘함", content: "심리학이 이번에 제일 쉬웠어요. 역학보다도" },
      { author: "총점은OK", content: "308점이면 합격인데 과락만 안 걸리면 됩니다!" },
    ],
  },

  // ===== 태권도 (categoryId: 10) =====
  {
    categoryId: 10,
    title: "필기 시험장 분위기가 어땠나요? 처음 응시합니다",
    content:
      "내년에 처음 응시하려고 하는데 시험장 분위기가 어떤지 궁금합니다.\n\n긴장되서 실수하는 분들도 많다고 들었는데...\n\n시험장 좌석은 어떻게 배정되나요? 랜덤인가요?\n\n그리고 시험 종료 전에 나갈 수 있나요?\n\n내년 시험 대비해서 미리 알아두고 싶습니다.",
    author: "내년응시예정",
    date: "2026-04-18 20:15:00",
    comments: [
      { author: "올해응시자", content: "좌석은 수험번호 순으로 배정됩니다. 분위기는 조용해요" },
      { author: "3년차", content: "시험 종료 전에는 못 나갑니다. 100분 꽉 채워야 해요" },
      { author: "긴장풀기", content: "전날 일찍 자고 아침에 가볍게 스트레칭 하면 도움 됩니다" },
      { author: "시험팁", content: "마킹 실수 방지를 위해 한 과목씩 마킹하는 걸 추천합니다" },
    ],
  },

  // ===== 배드민턴 (categoryId: 12) =====
  {
    categoryId: 12,
    title: "체육사에서 이길용이 누구인지 아시는 분?",
    content:
      "시험에서 이길용이라는 인물이 나왔는데 교재에서 본 적이 없어요.\n\n조선체육회, YMCA 관련 인물인 것 같은데... 정확히 뭘 한 사람인지 모르겠습니다.\n\n혹시 아시는 분 계시면 알려주세요.\n\n체육사 인물 정리 자료가 있으면 공유 부탁드립니다!",
    author: "이길용누구",
    date: "2026-04-18 12:45:00",
    comments: [
      { author: "체육사전공", content: "이길용은 일제강점기 마라톤 선수입니다. 손기정과 동시대 인물이에요" },
      { author: "자료공유", content: "체육사 인물 정리 PDF 있는데 카페에 올려놓겠습니다" },
      { author: "나도틀림", content: "저도 이 문제 틀렸어요. 교재에 안 나오는 인물이었는데..." },
    ],
  },

  // ===== 탁구 (categoryId: 13) =====
  {
    categoryId: 13,
    title: "시험 보고 나서 확실히 느낀 점 - 기출만으로는 부족합니다",
    content:
      "시험 보고 나서 확실히 느낀 거는 기출만 반복해서는 안 된다는 겁니다.\n\n올해 체감으로 기출 재출제 비율이 30%도 안 되는 것 같았어요.\n\n나머지 70%는 교재 이론이나 전공 서적 수준의 문제였습니다.\n\n특히 교육학, 체육사 쪽이 심했고 심리학이나 역학은 그나마 기출 비중이 높았어요.\n\n내년 준비하시는 분들은 교재 정독을 먼저 하시고 기출은 보충으로 하세요.",
    author: "기출한계체감",
    date: "2026-04-18 17:50:00",
    comments: [
      { author: "동감합니다", content: "저도 같은 생각입니다. 기출 5회독 했는데 60점도 안 나올 것 같아요" },
      { author: "교재추천", content: "이론서는 어떤 교재가 좋을까요? 추천 부탁드립니다" },
      { author: "내년각오", content: "내년에는 교재 먼저 정독하고 기출로 마무리해야겠네요" },
    ],
  },

  // ===== 검도 (categoryId: 17) =====
  {
    categoryId: 17,
    title: "윤리학에서 지라르(르네 지라르) 문제 나온 분 계신가요?",
    content:
      "윤리학에서 지라르 관련 문제가 나왔는데 기출에서 본 적이 없습니다.\n\n르네 지라르가 폭력과 성스러움에 대한 이론을 주장한 사람이라는데...\n\n윤리학은 하루면 끝낼 수 있다고 했는데 이런 문제가 나오면 어쩌라는 건지.\n\n윤리학도 이제 전공 수준으로 출제되는 건가요?",
    author: "지라르뭐야",
    date: "2026-04-18 13:00:00",
    comments: [
      { author: "윤리학패스", content: "지라르는 모방적 욕망 이론으로 유명한 사람입니다. 스포츠 폭력 관련으로 나온 듯" },
      { author: "하루만에", content: "윤리학 하루 공부로 60점 넘기려면 이런 문제는 포기해야..." },
      { author: "난이도상승", content: "올해부터 전체적으로 난이도가 올라간 것 같습니다" },
    ],
  },

  // ===== 클라이밍 (categoryId: 14) =====
  {
    categoryId: 14,
    title: "시험 끝나고 한 달 만에 운동 다시 시작합니다",
    content:
      "필기 준비하느라 한 달간 운동을 쉬었는데 오늘부터 다시 시작합니다.\n\n몸이 굳어있어서 워밍업만 30분 했네요 ㅋㅋ\n\n클라이밍은 꾸준히 해야 감각이 유지되는데 시험 기간에는 어쩔 수 없었어요.\n\n다시 감각 돌아오려면 2주는 걸릴 것 같습니다.\n\n시험 때문에 운동 쉬었다가 다시 시작하신 분 계신가요?",
    author: "운동재개",
    date: "2026-04-18 21:00:00",
    comments: [
      { author: "같은상황", content: "저도 한 달 쉬었는데 근육이 빠진 느낌이에요 ㅠ" },
      { author: "감각복구", content: "2주면 충분합니다. 천천히 올리세요!" },
      { author: "꾸준함이답", content: "시험 기간에도 주 1회는 유지하는 게 좋더라고요" },
    ],
  },

  // ===== 복싱 (categoryId: 15) =====
  {
    categoryId: 15,
    title: "필기 300점 딱 맞았는데 합격인가요 불합격인가요?",
    content:
      "가답안 채점 결과 딱 300점입니다.\n\n5과목 합계 300점이면 평균 60점이니까 합격인 거 맞죠?\n\n근데 과목별로 보면 교육학 44점, 체육사 56점, 심리 76점, 역학 64점, 사회학 60점이에요.\n\n교육학이 44점이면 과락은 아니니까 합격인 건가요?\n\n너무 아슬아슬해서 불안합니다...",
    author: "딱300점",
    date: "2026-04-18 15:50:00",
    comments: [
      { author: "합격입니다", content: "300점이면 평균 60점이고 과목별 과락도 없으니 합격입니다!" },
      { author: "축하드려요", content: "아슬아슬하지만 합격이에요! 실기 준비 시작하세요" },
      { author: "교육학위험", content: "교육학 44점이면 정말 아슬아슬했네요. 다행입니다 ㅎㅎ" },
    ],
  },

  // ===== 유도 (categoryId: 59) =====
  {
    categoryId: 59,
    title: "시험 직전 벼락치기 3일 공부법이 통했습니다",
    content:
      "저 사실 3일 벼락치기로 공부했는데 320점 나왔습니다.\n\n방법은 이렇습니다:\n1일차: 기출 5개년 1회독 (답만 외우기)\n2일차: 기출 2회독 + 오답노트\n3일차: 오답 반복 + 취약 과목 이론 정리\n\n물론 운도 좋았고, 이미 운동 관련 기초 지식이 있었어요.\n\n3일 공부가 추천은 아닙니다만... 시간 없는 분들 참고하세요 ㅋㅋ",
    author: "벼락치기왕",
    date: "2026-04-18 22:10:00",
    comments: [
      { author: "대단하다", content: "3일에 320점이면 기초 지식이 탄탄하신 거예요 ㅋㅋ" },
      { author: "비추천", content: "이건 진짜 운 좋은 케이스... 최소 2주는 잡으세요 여러분" },
      { author: "전공자", content: "체대 출신이면 기초가 있어서 가능할 수도 있어요" },
    ],
  },

  // ===== 합기도 (categoryId: 69) =====
  {
    categoryId: 69,
    title: "올해 시험 응시자 수가 역대 최다라고 합니다",
    content:
      "올해 생활체육지도사 2급 응시자 수가 역대 최다를 기록했다고 합니다.\n\n체감상 시험장에 사람이 정말 많았어요.\n\n코로나 이후로 건강에 관심이 많아지면서 체육지도사 자격증 수요가 계속 늘고 있다고 하네요.\n\n경쟁이 치열해지면 난이도도 같이 올라가는 건 아닌지 걱정됩니다.\n\n내년에는 더 많아질까요?",
    author: "응시자폭증",
    date: "2026-04-18 19:45:00",
    comments: [
      { author: "통계맨", content: "매년 10%씩 늘고 있다고 합니다. 빨리 따는 게 유리해요" },
      { author: "경쟁심화", content: "응시자 늘어도 합격 기준은 동일하니 너무 걱정 마세요" },
      { author: "시장분석", content: "자격증 가진 사람이 많아지면 취업 시 차별화가 필요해질 듯" },
    ],
  },

  // ===== 추가 보디빌딩 =====
  {
    categoryId: 1,
    title: "교육학 '합의적 교수법' 답이 뭔가요?",
    content:
      "교육학에서 합의적 교수법 문제가 나왔는데 답이 뭔지 모르겠습니다.\n\n보기에 직접교수법, 동료교수법, 탐구수업, 합의적 교수법이 있었는데...\n\n합의적 교수법은 교사와 학생이 함께 결정하는 방식이라고 한 것 같은데 맞나요?\n\n이 문제 정답이 뭔지 아시는 분 계신가요?",
    author: "합의적교수법",
    date: "2026-04-18 13:55:00",
    comments: [
      { author: "교육학전공", content: "합의적 교수법은 교사와 학생이 함께 의사결정하는 모형입니다. 답이 맞아요" },
      { author: "같은문제", content: "저도 이 문제 고민했는데 합의적 교수법이 답인 것 같습니다" },
      { author: "교재확인", content: "채피터 교재 187페이지에 설명 있어요. 확인해보세요" },
    ],
  },
  {
    categoryId: 1,
    title: "가답안 기준 과목별 점수 인증 모아봅시다",
    content:
      "다들 과목별 점수 어떻게 나오셨나요?\n\n저부터 공개합니다:\n교육학 56점\n체육사 64점\n심리학 72점\n윤리학 60점\n사회학 48점\n총점 300점\n\n사회학에서 과락 걱정했는데 다행히 넘겼네요.\n\n다른 분들 점수도 궁금합니다. 같이 공유해봐요!",
    author: "점수인증",
    date: "2026-04-18 15:30:00",
    comments: [
      { author: "저도공개", content: "교육학48 체육사60 심리80 역학72 윤리56 = 316점입니다" },
      { author: "과락위기", content: "교육학 40점... 딱 과락선인데 어떻게 되려나 ㅠ" },
      { author: "고득점", content: "교육학68 체육사72 심리84 역학76 윤리72 = 372점이요" },
      { author: "부럽다", content: "372점이면 상위권이시네요 대단합니다!" },
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
      // 조회수 20~50 랜덤
      const randomViews = Math.floor(Math.random() * 31) + 20;

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
