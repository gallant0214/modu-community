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
  // ===== 3차 시드: 카톡 대화 추출 (생체/장체/노인/유소년 방) =====

  // ===== 수영 (categoryId: 5) =====
  {
    categoryId: 5,
    title: "IM 1분47초인데 어디서부터 줄여야 할까요",
    content:
      "생체 수영 IM 100m가 현재 1분 47초입니다.\n\n솔직히 어디서부터 기록을 줄여야 할지 모르겠어요.\n\n접영에서 체력이 다 빠지고 배영에서 호흡이 안 되는데...\n\n선배님들 조언 부탁드립니다.\n\n스타트도 아직 못 하고 물속출발로 하고 있어요.",
    author: "기록단축갈망",
    date: "2026-04-06 11:30:00",
    comments: [
      { author: "IM마스터", content: "턴이 제일 중요합니다. 턴에서 5~7초 줄일 수 있어요" },
      { author: "수영10년차", content: "배영에서 무호흡으로 버티고 접영에서 체력 아끼세요" },
      { author: "코치경험자", content: "스타트 특강 한번 들어보세요. 2초는 바로 줍니다" },
    ],
  },
  {
    categoryId: 5,
    title: "배영할 때 자꾸 사이드로 빠지는데 실격인가요?",
    content:
      "배영 턴할 때 사이드로 빠지는 건 실격 기준이 뭔가요?\n\n등이 90도 이상 돌아가면 안 된다고 들었는데...\n\n머리 위치나 이런 거 보나요?\n\n시험장에서 DQ 많이 나오나요?",
    author: "배영고민러",
    date: "2026-04-09 08:20:00",
    comments: [
      { author: "심판경험", content: "등이 90도 넘어가면 됩니다. 그거 외에 없어요" },
      { author: "실기합격자", content: "터치 시점에 등만 안 보이면 괜찮습니다" },
    ],
  },
  {
    categoryId: 5,
    title: "스타트 다이빙 vs 물속출발 뭐가 더 유리한가요",
    content:
      "실기 시험에서 스타트를 하는 게 나은지 물속출발이 나은지 고민입니다.\n\n스타트하면 기록은 빠른데 잘못하면 미끄러지거나 배치기 할 수도 있고...\n\n물속출발은 안전하지만 2초 정도 느리다고 하더라고요.\n\n다들 어떻게 하셨나요?",
    author: "스타트고민중",
    date: "2026-04-07 15:06:00",
    comments: [
      { author: "다이빙파", content: "스타트 가야 기록 나옵니다. 연습 충분히 하세요" },
      { author: "안전파", content: "저는 물속출발로 1분27초 나왔어요. 기록 나오면 물속도 괜찮습니다" },
      { author: "경험담공유", content: "시험장에서 미끄러져서 턴부터 다 꼬인 경험 있어요 ㅋㅋ" },
      { author: "코치조언", content: "고개를 숙여서 들어가야 물이 안 들어와요. 턱 당기세요!" },
    ],
  },
  {
    categoryId: 5,
    title: "IM 2분 넘는데 어떻게 줄여야 하나요 ㅠ",
    content:
      "IM 100m가 2분이 넘습니다.\n\n체력 문제인 건 알겠는데 어떻게 체력을 올려야 할지 모르겠어요.\n\n매일 수영장 다니는데 1km도 못 채우고 나옵니다.\n\n접영 25m 끝나면 이미 헥헥거려서 배영이 안 되는 수준이에요.",
    author: "2분탈출하고싶다",
    date: "2026-04-06 17:13:00",
    comments: [
      { author: "선배팁", content: "IM200을 천천히 쉬지 않고 1시간 동안 반복하세요. 체력 올라갑니다" },
      { author: "체력해결사", content: "인터벌 훈련이 답입니다. 50m 10개 세트로 시작해보세요" },
      { author: "수영방장", content: "체력 키우려면 IM보다 각 영법 50m씩 따로 연습하세요" },
    ],
  },
  {
    categoryId: 5,
    title: "턴 연습 가능한 수영장 찾기가 진짜 어렵네요",
    content:
      "턴 연습하려고 하는데 수영장마다 사람이 너무 많아서 기회가 없어요.\n\n레인도 공유해야 하고 뒤에 사람이 오면 턴 연습 못 하잖아요.\n\n새벽 시간대에 가면 좀 나을까요?\n\n아니면 개인 레슨 받아야 하나요?",
    author: "턴연습난민",
    date: "2026-04-05 13:20:00",
    comments: [
      { author: "새벽수영러", content: "새벽 5시에 가면 사람 거의 없어요. 추천합니다" },
      { author: "레슨추천", content: "개인 레슨 받으면 턴 1시간 만에 기본은 잡을 수 있어요" },
    ],
  },
  {
    categoryId: 5,
    title: "접영 킥할 때 골반이 안 움직여요 도와주세요",
    content:
      "접영 돌핀킥을 연습하는데 무릎만 구부려지고 골반이 안 움직입니다.\n\n코치님이 골반에서부터 웨이브가 나와야 한다고 하시는데 감이 안 잡혀요.\n\n물속에서는 뭐가 뭔지 모르겠고 킥보드 잡고 해도 안 되네요.\n\n혹시 육상에서 할 수 있는 연습 방법 있을까요?",
    author: "돌핀킥초보",
    date: "2026-04-06 16:11:00",
    comments: [
      { author: "접영코치", content: "벽 잡고 킥 연습 먼저 하세요. 핀 끼면 감각 잡기 좋아요" },
      { author: "같은고민", content: "저도 3개월 걸렸어요. 꾸준히 하면 됩니다!" },
      { author: "팁공유", content: "침대에서 엎드려서 웨이브 연습해보세요. 의외로 도움 됩니다" },
    ],
  },
  {
    categoryId: 5,
    title: "자유형 25m 18초면 빠른 건가요?",
    content:
      "자유형 25m 기록이 18초 정도 나옵니다.\n\n여성인데 이 정도면 빠른 편인가요?\n\nIM에서 자유형이 마지막이라 체력이 남아있어야 하는데...\n\n혼자 연습하다 보니 내 기록이 어느 수준인지 감이 안 잡혀요.",
    author: "기록궁금녀",
    date: "2026-04-08 13:53:00",
    comments: [
      { author: "수영선생", content: "25m 18초면 여성 기준 빠른 편이에요!" },
      { author: "비교기준", content: "IM 기준으로 자유형 20초 내외면 안정권입니다" },
    ],
  },
  {
    categoryId: 5,
    title: "수영할 때 카페인 섭취 효과 있나요?",
    content:
      "시험 전에 카페인 먹으면 도움이 되나요?\n\n핫식스나 몬스터 같은 에너지 드링크 먹으면 기록이 좋아질까요?\n\n아니면 그냥 커피 한 잔이 나을까요?\n\n혹시 드시는 분들 추천 부탁드립니다.",
    author: "카페인러버",
    date: "2026-04-10 07:54:00",
    comments: [
      { author: "경험공유", content: "30분 전에 커피 한 잔이 제일 나아요. 에너지 드링크는 과다섭취 주의" },
      { author: "노카페인파", content: "저는 바나나 + 꿀물이 더 잘 맞았어요" },
      { author: "주의사항", content: "처음 먹는 건 시험 당일에 하지 마세요! 미리 연습 때 테스트하세요" },
    ],
  },

  // ===== 보디빌딩 (categoryId: 1) =====
  {
    categoryId: 1,
    title: "윤리학 암기법 공유 - 겔발트 이중성, 모방된 지라르",
    content:
      "윤리학 암기법 공유합니다.\n\n겔발트의 이중성 (폭력의 이중성)\n모방된 지라르이다 (폭력의 모방-지라르)\n\n파슬러 먹고 다 쉬파하네 (먹고 파신의 모든 잠재적 쉬파에서)\n\n베네수의 인어 (베네-고전적 고대 인문학 중심 전통적 인격교육)\n\n이런 식으로 단편적인 것들이에요.\n\n기출 풀면서 오답 정리해보세요.",
    author: "윤리암기왕",
    date: "2026-04-05 14:38:00",
    comments: [
      { author: "감사해요", content: "모방된 지라르이다 ㅋㅋㅋㅋ 웃기지만 기억에 남네요" },
      { author: "기출풀이중", content: "이거 진짜 시험에 나오는 거예요? 바로 외울게요" },
      { author: "추가공유", content: "저도 비슷하게 외웠어요! 첨가해서 정리하면 좋겠다" },
    ],
  },
  {
    categoryId: 1,
    title: "체육사에서 조선체육회랑 조선체육협회가 다른 건가요?",
    content:
      "체육사 공부하다가 헷갈리는 게 있어서 질문합니다.\n\n조선체육회는 1920년 설립이고 조선체육협회는 1919년이라는데 맞나요?\n\n조선체육협회가 경성일보 후원으로 설립되고 제1회 전조선 권경기대회를 개최했다고 하는데...\n\n조선체육회는 고려구락부가 모체이고 제1회 전 조선 야구대회 개최한 거 맞죠?\n\n이거 시험에 꼭 나온다고 하더라고요.",
    author: "체육사헷갈림",
    date: "2026-04-07 10:29:00",
    comments: [
      { author: "체육사마스터", content: "맞습니다. 협회(1919) → 회(1920) 순서예요. 3.1 이후 민족의식으로 설립" },
      { author: "연도정리", content: "체육협회 1919, 체육회 1920, 1년 차이 꼭 기억하세요!" },
      { author: "시험출제", content: "이 문제 거의 매년 나와요. 조선체육회가 이후 대한체육회로 명칭 변경됨" },
      { author: "추가팁", content: "일제강점기 체육단체 순서랑 연결해서 외우세요" },
    ],
  },
  {
    categoryId: 1,
    title: "기출문제 답 외워지는데 새로운 문제 어디서 구하나요",
    content:
      "기출을 3~4번씩 반복했더니 답이 그냥 외워져 버렸어요.\n\n문제 보면 답이 바로 떠오르는 수준이라 실력인지 외운 건지 구분이 안 됩니다.\n\n새로운 모의고사나 문제집 추천해주세요.\n\n앱으로 풀 수 있는 것도 괜찮습니다.",
    author: "기출중독자",
    date: "2026-04-07 13:55:00",
    comments: [
      { author: "방장님조언", content: "답을 체크하지 말고 점수만 보세요. 답 외우면 실력이 아닙니다" },
      { author: "앱추천", content: "퍼스트펭귄 앱에서 모의고사 기능 있어요. 추천합니다" },
      { author: "공부방법", content: "기출 볼 때 정답 체크 안 하고 틀린 것만 확인하는 게 효과적이에요" },
    ],
  },
  {
    categoryId: 1,
    title: "역학이랑 심리학 중에 뭐가 더 쉬운가요",
    content:
      "과목 선택 고민 중입니다.\n\n이과라서 역학이 쉬울 줄 알았는데 실제로 문제 풀어보니 꼬는 문제도 있더라고요.\n\n심리학은 양이 많아서 싫고 역학은 공식이 싫고...\n\n이과 출신인데 역학 가는 게 맞을까요?\n\n심리학 선택하신 분들 의견도 듣고 싶습니다.",
    author: "과목선택고민",
    date: "2026-04-09 16:53:00",
    comments: [
      { author: "역학추천", content: "이과면 역학 가세요. 단원이 짧아서 공부할 양이 적습니다" },
      { author: "심리학파", content: "심리학은 공감이 되면 외우기 쉬워요. 사람마다 달라요" },
      { author: "둘다해봄", content: "역학은 계산 실수만 안 하면 고득점 가능합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "직장인인데 퇴근 후 공부 2시간이 한계입니다",
    content:
      "직장 다니면서 시험 준비 중인데 퇴근하면 너무 피곤해요.\n\n수영 연습까지 하면 공부할 체력이 없습니다.\n\n하루 2시간 공부로 합격 가능할까요?\n\n주말에 몰아서 하는 게 나을까요?",
    author: "직장인수험생",
    date: "2026-04-12 22:57:00",
    comments: [
      { author: "합격선배", content: "저도 퇴근 후 2시간씩 3주 하고 합격했어요. 충분합니다" },
      { author: "집중이답", content: "3시간 대충 보는 것보다 30분 집중이 낫습니다" },
      { author: "동기부여", content: "짧게 짧게 집중하는 게 뇌 피로를 줄여줘요. 화이팅!" },
    ],
  },

  // ===== 축구 (categoryId: 2) =====
  {
    categoryId: 2,
    title: "필기 공부할 때 해그리 인강 vs 유튜브 무료강의 비교",
    content:
      "필기 준비하는데 인강을 들을지 유튜브만 볼지 고민입니다.\n\n해그리 인강이 유명하다고 들었는데 가격이 좀 부담스러워요.\n\n유튜브에서 해그리스포츠 검색하면 무료 강의도 있더라고요.\n\n둘 다 써보신 분 계시면 비교 부탁드립니다.",
    author: "인강고민중",
    date: "2026-04-10 08:35:00",
    comments: [
      { author: "해그리수강생", content: "해그리 인강 추천합니다. 설명이 자세하고 기출 피드백도 해줘요" },
      { author: "무료파", content: "유튜브만으로도 합격 가능해요. 교재는 별도로 사세요" },
      { author: "둘다추천", content: "교재 남박여슬림 사고 강의는 유튜브로 해그리/단박 들으면 최고 조합" },
    ],
  },

  // ===== 요가필라테스 (categoryId: 3) =====
  {
    categoryId: 3,
    title: "교육학 인강 4시간 듣다가 잠들었습니다",
    content:
      "교육학 인강 듣는데 너무 졸려요.\n\n프로파일이니 직접교수법이니 용어가 머리에 안 들어옵니다.\n\n4시간 인강 듣다가 중간에 잠들었어요 ㅋㅋ\n\n교육학 공부법 조언 부탁드립니다.\n\n기출만 풀면 될까요 아니면 이론을 먼저 봐야 할까요?",
    author: "교육학졸림",
    date: "2026-04-11 11:17:00",
    comments: [
      { author: "교육학합격", content: "1.5배속으로 빠르게 한번 보고 기출로 마무리하세요" },
      { author: "공부팁", content: "하루에 한 과목씩 인강 뽑고 기출 풀면 효율적이에요" },
      { author: "동감", content: "저도 교육학 2분 만에 껐어요 ㅋㅋ 기출 위주로 합시다" },
    ],
  },

  // ===== 테니스 (categoryId: 4) =====
  {
    categoryId: 4,
    title: "시험 당일 준비물 완벽 정리 (수험표/신분증/사인펜)",
    content:
      "시험 당일 준비물 정리합니다.\n\n1. 수험표 - 반드시 출력! 접수증이 아니라 수험표입니다.\n2. 신분증 - 주민등록증, 운전면허증 등\n3. 컴퓨터용 싸인펜 - 본인 것 준비 추천\n4. 수정 테이프 - 사용 가능합니다\n\n시험장에 9시 30분까지 입실하세요.\n시험지는 가져올 수 있고 오후에 가답안 확인 가능합니다.\n\n흑백 출력도 가능하니 참고하세요!",
    author: "꼼꼼이",
    date: "2026-04-14 10:18:00",
    comments: [
      { author: "감사합니다", content: "수정 테이프 사용 가능한 거 몰랐어요! 챙겨야겠네요" },
      { author: "주의사항", content: "접수증이랑 수험표 다른 거예요! 꼭 수험표 출력하세요" },
      { author: "시험팁", content: "사인펜은 감독관이 빌려주기도 하는데 여러 사람 써서 잘 안 나올 수 있어요" },
      { author: "작년합격자", content: "가답안은 보통 오후 3시쯤 체육지도자 홈페이지에 올라옵니다" },
    ],
  },

  // ===== 골프 (categoryId: 6) =====
  {
    categoryId: 6,
    title: "생체 받고 나면 장체도 같이 따는 게 좋나요?",
    content:
      "생활체육지도사 2급 수영 준비 중인데 장애인체육도 같이 따려고 합니다.\n\n장체는 구술이 일반의 3배 어렵다는 얘기를 들었는데 정말인가요?\n\n생체 가지고 있으면 장체 특별과정으로 필기 면제되나요?\n\n장체 경험 있으신 분 조언 부탁드립니다.",
    author: "장체도전기",
    date: "2026-04-07 20:17:00",
    comments: [
      { author: "장체합격자", content: "장체 구술이 확실히 범위가 넓긴 한데 생체 있으면 기초가 있으니 괜찮아요" },
      { author: "특별과정", content: "생체 보유하면 특별과정으로 필기 면제됩니다. 실기구술만 보면 돼요" },
      { author: "현실조언", content: "장체는 장애 유형별 규칙이 많아서 꼼꼼하게 준비해야 합니다" },
    ],
  },

  // ===== 농구 (categoryId: 7) =====
  {
    categoryId: 7,
    title: "53세인데 생활체육지도사 도전합니다",
    content:
      "53세입니다.\n\n나이가 많다고 포기하지 마세요.\n\n저도 수영 시작한 지 5년 넘었고 이 자격증이 꼭 필요해서 도전합니다.\n\n체력은 젊은 분들보다 부족하지만 꾸준함으로 이길 수 있다고 생각합니다.\n\n어려운 상황을 이겨내고 모두 화이팅입시다.",
    author: "늦깎이도전자",
    date: "2026-04-10 16:18:00",
    comments: [
      { author: "존경합니다", content: "멋지십니다! 하고 싶은 것에 도전하는 모습 정말 존경해요" },
      { author: "나이무관", content: "나이는 숫자에 불과해요! 꼭 합격하시길 바랍니다" },
      { author: "동기부여", content: "이런 글 보면 저도 더 열심히 해야겠다는 생각이 듭니다" },
    ],
  },

  // ===== 배구 (categoryId: 8) =====
  {
    categoryId: 8,
    title: "기출 3회독 했는데 답이 외워져서 의미가 없어요",
    content:
      "기출을 3번이나 풀었더니 답이 그냥 기억나요.\n\n문제 보면 '아 이건 3번이지' 이런 식으로 풀게 됩니다.\n\n이게 실력인지 단순 암기인지 모르겠어요.\n\n모의고사로 실력 체크해봐야 할까요?\n\n방장님이 답 체크 말고 점수만 보라고 하셨는데 공감됩니다.",
    author: "기출암기병",
    date: "2026-04-07 13:55:00",
    comments: [
      { author: "공부법전문", content: "기출 볼 때 정답 체크 안 하고 점수만 확인하세요. 답 외우면 안 됩니다" },
      { author: "모의고사추천", content: "퍼스트펭귄이나 체육마스터 앱에서 모의고사 풀어보세요" },
    ],
  },

  // ===== 태권도 (categoryId: 10) =====
  {
    categoryId: 10,
    title: "해그리 인강 들어본 후기 - 교육학이 진짜 난관이다",
    content:
      "해그리스포츠 인강으로 공부 중인데 후기 공유합니다.\n\n교육학 강의가 진짜 길고 지루해요.\n\n문제 글밥이 제일 많아서 집중력이 떨어지는 과목입니다.\n\n반면 심리학이나 윤리학은 좀 짧아서 견딜만 합니다.\n\n역학은 고등학교 물리 느낌이라 이과 출신은 괜찮을 거예요.\n\n결론: 교육학은 일찍 시작하세요!",
    author: "인강수강후기",
    date: "2026-04-13 08:32:00",
    comments: [
      { author: "동감", content: "교육학 강의 4시간인데 2분 만에 껐어요 ㅋㅋ" },
      { author: "공부법", content: "교육학은 인강보다 기출 위주로 하는 게 효율적이에요" },
      { author: "과목비교", content: "심리학 윤리학 사회학이 공부해서 재밌는 과목이에요" },
    ],
  },

  // ===== 배드민턴 (categoryId: 12) =====
  {
    categoryId: 12,
    title: "수험표 출력할 때 접수증이랑 헷갈리지 마세요",
    content:
      "시험 준비하시는 분들 주의사항입니다.\n\n접수증과 수험표는 다릅니다!\n\n매년 접수증 출력해가지고 가시는 분들 꽤 많다고 해요.\n\n반드시 상단에 '수험표'라고 적혀 있는지 확인하세요.\n\n수험표 출력 링크: 체육지도자 홈페이지 마이페이지에서 가능합니다.\n\n흑백도 가능하고 본인 사진 확인도 필수입니다.",
    author: "수험표주의",
    date: "2026-04-14 10:22:00",
    comments: [
      { author: "감사", content: "이거 진짜 중요한 정보네요. 꼭 확인할게요!" },
      { author: "경험담", content: "작년에 접수증 들고 갔다가 당황한 사람 봤어요. 조심하세요!" },
    ],
  },

  // ===== 탁구 (categoryId: 13) =====
  {
    categoryId: 13,
    title: "수영 체력은 수영으로만 올릴 수 있나요?",
    content:
      "수영 체력이 너무 부족해요.\n\n웨이트 하면 도움이 될까요?\n\n달리기 백날 해도 수영 못 하겠더라고요.\n\n사용 근육이 다르다고 하는데...\n\n결국 수영 체력은 수영으로 올려야 하는 건가요?",
    author: "체력부족남",
    date: "2026-04-08 13:09:00",
    comments: [
      { author: "코치의견", content: "맞습니다. 수영 체력은 수영으로 올리는 게 가장 좋아요" },
      { author: "보충운동", content: "코어 운동이랑 스트레칭은 도움 됩니다. 유연성 중요해요" },
      { author: "경험담", content: "수영만 주 5회 다니니까 2개월 만에 체력 확 올랐어요" },
      { author: "밴드추천", content: "밴드 운동으로 물잡기 연습하면 수영에 도움 많이 돼요" },
    ],
  },

  // ===== 검도 (categoryId: 17) =====
  {
    categoryId: 17,
    title: "체육사 공부할 때 연도 외우기가 진짜 어렵습니다",
    content:
      "체육사 과목이 진짜 싫습니다.\n\n일제강점기 체육단체 연도, 올림픽 보이콧 연도, 규칙 변경 연도...\n\n외워도 외워도 끝이 없어요.\n\n한국사 1급인 저도 체육사는 멘붕입니다 ㅋㅋ\n\n연도 암기 팁 있으신 분 공유 부탁드립니다.",
    author: "연도암기지옥",
    date: "2026-04-13 08:35:00",
    comments: [
      { author: "플래시카드", content: "플래시카드 만들어서 매일 보면 외워져요. 앱으로도 가능합니다" },
      { author: "스토리텔링", content: "사건을 스토리로 연결하면 기억에 남아요. 단순 암기보다 효과적" },
      { author: "기출위주", content: "기출에 나오는 연도 위주로만 외우세요. 전부 다 외울 필요 없어요" },
    ],
  },

  // ===== 클라이밍 (categoryId: 14) =====
  {
    categoryId: 14,
    title: "일주일 남았는데 지금부터 뭘 해야 할까요",
    content:
      "시험이 일주일 남았습니다.\n\n아직 인강도 다 못 봤고 기출도 3년치밖에 못 풀었어요.\n\n지금부터 뭘 집중해야 할까요?\n\n인강 마저 볼까요 아니면 기출만 돌릴까요?\n\n멘탈이 무너지려고 합니다 ㅠ",
    author: "일주일남았다",
    date: "2026-04-10 09:15:00",
    comments: [
      { author: "벼락치기성공", content: "지금부터 기출만 집중하세요. 인강 볼 시간 없어요" },
      { author: "방장님말씀", content: "일주일도 충분합니다. 기출 + 유튜브로 하시면 됩니다" },
      { author: "응원", content: "포기하지 마세요! 벼락치기로 합격하는 분들 많아요!" },
      { author: "전략적으로", content: "취약 과목 하루, 나머지 과목 하루씩 배분해서 돌리세요" },
    ],
  },

  // ===== 복싱 (categoryId: 15) =====
  {
    categoryId: 15,
    title: "사회학이랑 심리학 중 뭐가 더 점수 나오나요",
    content:
      "사회학이랑 심리학 둘 다 비슷한 거 같은데 뭐가 더 쉬울까요?\n\n사회학은 그말이그말 같고 심리학은 양이 많고...\n\n기출 점수는 사회학이 조금 더 높은데 실제 시험은 어떤가요?\n\n경험자분들 조언 부탁드립니다.",
    author: "사심고민",
    date: "2026-04-07 16:56:00",
    comments: [
      { author: "사회학추천", content: "사회학이 양이 적어서 단기간에 점수 올리기 좋아요" },
      { author: "심리학파", content: "심리학은 이해하면 문제 풀기 쉬운데 양이 문제죠" },
    ],
  },

  // ===== 유도 (categoryId: 59) =====
  {
    categoryId: 59,
    title: "장애인체육 구술은 일반의 3배 분량이라는데",
    content:
      "장애인체육지도사를 준비하려고 하는데 구술이 일반의 3배라고 들었어요.\n\n일반 경기규칙 + 장애인 규칙 + 등급분류 + 지도방법까지 다 알아야 한다고...\n\n근데 일반 시험에서 합격했으면 장체 구술은 좀 쉬운 건가요?\n\n장체 경험자분들 난이도가 어느 정도인지 궁금합니다.",
    author: "장체구술걱정",
    date: "2026-04-07 20:19:00",
    comments: [
      { author: "장체합격자", content: "범위가 넓긴 한데 일반 기초가 있으면 추가로 장애 유형별 규칙만 공부하면 돼요" },
      { author: "현실적으로", content: "경기규칙이 종목마다 달라서 꼼꼼하게 준비해야 합니다" },
      { author: "정보공유", content: "WPS 규정 번역본 찾아보세요. 올해 변경된 거 기준으로 준비해야 해요" },
    ],
  },

  // ===== 합기도 (categoryId: 69) =====
  {
    categoryId: 69,
    title: "모두의지도사 앱 써보신 분 계신가요?",
    content:
      "모두의지도사라는 앱을 발견했는데 써보신 분 계신가요?\n\n기출문제 풀기랑 AI 해설 기능이 있다고 하더라고요.\n\n무료 범위가 어디까지인지 궁금합니다.\n\n다른 앱이랑 비교해서 어떤지도 알려주세요!",
    author: "앱탐색중",
    date: "2026-04-14 15:10:00",
    comments: [
      { author: "앱사용자", content: "모두의지도사 괜찮아요! 기본 무료 범위가 넓은 편입니다" },
      { author: "비교후기", content: "퍼스트펭귄이 기출 해설이 더 자세한 편이에요" },
      { author: "추천", content: "구술 카드 기능이 유용합니다. 구술 준비할 때 도움 돼요" },
    ],
  },

  // ===== 추가 수영 게시글 =====
  {
    categoryId: 5,
    title: "배터플라이 턴할 때 양손 동시 터치 해야 하나요",
    content:
      "배터플라이 턴할 때 양손 동시 터치를 해야 하는 건 알겠는데...\n\n실제로 시험장에서 깐깐하게 보나요?\n\n크로스오버 턴이나 포스트턴 같은 것도 가능한가요?\n\n벽에서 조금 어긋나게 터치해도 되는지 궁금합니다.",
    author: "턴규칙궁금",
    date: "2026-04-11 18:25:00",
    comments: [
      { author: "심판기준", content: "양손 동시 터치가 규칙이에요. 어긋나면 실격 가능합니다" },
      { author: "연습팁", content: "터치 시점에 등만 안 보이면 괜찮아요. 연습 많이 하세요" },
      { author: "합격후기", content: "저는 포스트턴으로 했는데 문제 없었어요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 IM 연습 루틴 공유합니다 (주 5회 기준)",
    content:
      "수영 실기 준비 루틴 공유합니다.\n\n워밍업 200m 자유형\n접영 50m x 4세트 (각 영법 200m)\n자유형 50m x 10세트 인터벌 500m / 총 1500m\n배영 50m x 5세트 250m\n배터 50m x 5세트 250m / 총 2000m\n평영 50m x 5세트 250m\n접 25m x 10세트 250m / 총 2500m\nIM 100m x 3세트\n다운 50m\n\n주 2회 정도 이런 식으로 하고 있어요.\n체력이 올라가는 게 느껴집니다!",
    author: "루틴공유맨",
    date: "2026-04-08 13:07:00",
    comments: [
      { author: "대단하다", content: "하루에 2500m 이상이면 엄청나네요! 참고할게요" },
      { author: "초보질문", content: "IM200도 천천히 해도 괜찮은 건가요?" },
      { author: "방장조언", content: "IM200을 3분 안에 할 수 있으면 IM100 90초는 진짜 껌이에요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영할 때 고개를 들면 하체가 가라앉아요",
    content:
      "수영할 때 자꾸 고개가 올라가는 습관이 있어요.\n\n고개 들면 하체가 가라앉고 저항이 커져서 느려진다고 하는데...\n\n코치님이 고개를 숙이라고 하시는데 숙이면 물을 먹어요 ㅠ\n\n고개 위치 잡는 방법 좀 알려주세요.",
    author: "고개든사람",
    date: "2026-04-07 15:37:00",
    comments: [
      { author: "전문코치", content: "스트림라인 유지가 핵심이에요. 고개 숙이면 하체가 올라옵니다" },
      { author: "같은경험", content: "저도 처음에 그랬는데 벽잡고 킥 연습하면서 고개 고정하니 좋아졌어요" },
      { author: "팁추가", content: "물속에서 바닥 보는 느낌으로 하세요. 수면을 보면 안 됩니다" },
    ],
  },

  // ===== 추가 보디빌딩 =====
  {
    categoryId: 1,
    title: "기출 15년도부터 25년도까지 다 풀어봤는데",
    content:
      "15년도부터 25년도까지 기출 전부 풀어봤습니다.\n\n대부분 비슷한 내용이 반복되는데 5~6문제 정도가 좀 어려운 신규 문제예요.\n\n22년도부터 문제 질이 좀 올라간 느낌이 있어요.\n\n15~16년도는 상대적으로 쉽고 17년, 24년이 어려웠습니다.\n\n최근 기출 위주로 3~5개년 반복이 제일 효율적인 것 같습니다.",
    author: "기출전년도분석",
    date: "2026-04-12 12:03:00",
    comments: [
      { author: "동감", content: "22년도부터 확실히 교수님들이 좀 신경 쓴 느낌이에요" },
      { author: "기출팁", content: "최신 5개년이면 충분합니다. 너무 옛날 것은 트렌드가 달라요" },
      { author: "합격비결", content: "기출 + 오답정리가 핵심이에요. 답 외우지 말고 이해하세요" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 전날 잠이 안 오는 분들을 위한 팁",
    content:
      "시험 전날 긴장돼서 잠이 안 올 수 있어요.\n\n두려움은 실체가 아니라 해석이에요.\n\n아직 일어나지 않은 일을 실제처럼 느끼는 순간 두려움은 현실처럼 몸에 조여옵니다.\n\n완벽하게 준비된 시험이 아니더라도 괜찮습니다.\n\n이번 주 토요일, 긴장보다는 집중으로 후회 없이 하고 나오시길 바랍니다.\n\n모두 좋은 결과 있으시길!",
    author: "멘탈코치",
    date: "2026-04-13 20:48:00",
    comments: [
      { author: "위로감사", content: "이런 글 정말 필요했어요. 감사합니다 ㅠ" },
      { author: "공감100", content: "두려움은 실체가 아니라 해석이다... 명언이네요" },
      { author: "화이팅", content: "다들 화이팅! 이번에 꼭 합격합시다!" },
    ],
  },

  // ===== 댓글 없는 게시글 (20%) =====
  {
    categoryId: 5,
    title: "수영장 일일 이용권 가격 얼마 정도 하나요",
    content:
      "수영 실기 연습하려고 수영장 다니는데 가격이 궁금합니다.\n\n제가 다니는 곳은 일일 이용권이 4천원인데 다른 곳은 어떤가요?\n\n월정액이 더 유리할까요?\n\n50m 풀에서 스타트 가능한 곳은 가격이 좀 더 비싸더라고요.",
    author: "수영장가격궁금",
    date: "2026-04-06 21:48:00",
    comments: [],
  },
  {
    categoryId: 1,
    title: "아디다스 교재 오류가 좀 있더라고요",
    content:
      "아디다스 교재로 공부하고 있는데 일부 내용에 오류가 있는 것 같아요.\n\n근수축 효율성 부분에서 분자 분모가 반대로 되어 있는 것 같은데...\n\n혹시 같은 경험 있으신 분 계신가요?\n\n교재는 거들뿐 공부는 교재 하나로 하면 안 된다는 말이 맞는 것 같습니다.",
    author: "교재오류발견",
    date: "2026-04-08 13:43:00",
    comments: [],
  },
  {
    categoryId: 2,
    title: "필기 끝나면 실기 바로 준비해야 하나요",
    content:
      "필기 시험 보고 나서 바로 실기 준비 시작해야 하나요?\n\n합격 발표 전에 미리 수영장 등록하고 연습 시작하는 게 나을까요?\n\n실기 시험이 6월이라고 하던데 시간이 촉박할 것 같아요.\n\n합격 확인 전에 실기 준비하시는 분들 계신가요?",
    author: "실기타이밍",
    date: "2026-04-06 16:06:00",
    comments: [],
  },
  {
    categoryId: 3,
    title: "노인스포츠지도사도 필기 면제 가능한가요",
    content:
      "생체2급 보유 중인데 노인스포츠지도사 추가 취득하려고 합니다.\n\n특별과정으로 필기 면제되나요?\n\n실기 구술만 보면 되는 건지 궁금합니다.\n\n어디서 정보 얻으면 좋을까요?",
    author: "노스포궁금",
    date: "2026-04-07 17:50:00",
    comments: [],
  },
  {
    categoryId: 13,
    title: "생체 시험 보는 이유가 뭔가요? 다들 취업 때문인가요",
    content:
      "다들 생활체육지도사 시험 보는 이유가 궁금합니다.\n\n취업 때문인지 아니면 본인 실력 검증인지...\n\n저는 그냥 수영이 본업이라 실력 검증 용도입니다.\n\n장체나 노인 쪽은 취업 목적이 많으신 것 같더라고요.\n\n다들 어떤 이유로 준비하고 계신가요?",
    author: "동기궁금",
    date: "2026-04-07 17:44:00",
    comments: [],
  },

  // ===== 추가 게시글들 =====
  {
    categoryId: 5,
    title: "수영 배영에서 호흡 타이밍이 안 잡혀요",
    content:
      "배영할 때 호흡이 안 되는 분들 있나요?\n\n저만 그런 건지... 배영은 사실 호흡이 되는 것도 아닌데 숨이 가빠지네요.\n\n터치하고 돌아가는 순간부터 호흡이 불안정해져요.\n\n배영에서 무호흡으로 빠르게 하는 게 나을까요?\n\n아니면 편하게 호흡하면서 가는 게 나을까요?",
    author: "배영호흡난",
    date: "2026-04-06 16:14:00",
    comments: [
      { author: "수영선배", content: "배영은 코로 내쉬면서 가세요. 턴할 때 물 들어오지 않게" },
      { author: "팁공유", content: "호흡은 본인이 제일 편하고 빠른 걸 찾아야 해요" },
      { author: "코치조언", content: "배영에서 호흡이 어려운 건 체력 문제예요. 체력 먼저 올리세요" },
    ],
  },
  {
    categoryId: 1,
    title: "퍼스트펭귄 기출 사이트 무료인데 꽤 괜찮네요",
    content:
      "퍼스트펭귄이라는 기출 사이트를 발견했는데 무료치고 꽤 좋더라고요.\n\n기출문제 풀기 + 해설 확인이 다 무료입니다.\n\n학습분석 기능도 있어서 약한 과목을 확인할 수 있어요.\n\n광고가 없는 것도 장점이네요.\n\n공부하시는 분들 참고하세요!",
    author: "사이트추천",
    date: "2026-04-12 22:37:00",
    comments: [
      { author: "이미사용중", content: "저도 퍼스트펭귄 쓰고 있어요. 무료인데 퀄리티 좋습니다" },
      { author: "비교후기", content: "체육마스터보다 해설이 더 자세한 편이에요" },
    ],
  },
  {
    categoryId: 6,
    title: "수구조사 2급이랑 생체 중 뭐가 더 어렵나요",
    content:
      "수구조사 2급이랑 생활체육지도사 2급 중 어느 게 더 어려울까요?\n\n수구조사는 실기가 체력 콤보라서 힘들고 생체는 영법 스킬이라 다른 느낌인데...\n\n둘 다 해보신 분 비교 부탁드립니다.\n\n취업 시 어느 게 더 유리한지도 궁금합니다.",
    author: "자격증비교중",
    date: "2026-04-08 14:18:00",
    comments: [
      { author: "둘다보유", content: "개인적으로 생체가 준비 과정이 더 힘들었습니다" },
      { author: "수구조사경험", content: "수구조사는 체력만 되면 붙는 거 같아요. 생체가 실기 범위가 넓어요" },
      { author: "취업정보", content: "수영장 취업은 생체가 필수이고 수구조사는 옵션입니다" },
    ],
  },
  {
    categoryId: 8,
    title: "사회학에서 긍정적 일탈이 뭔지 아시는 분?",
    content:
      "기출에서 긍정적 일탈이라는 용어가 나왔는데 처음 봤습니다.\n\n보통 일탈이면 부정적인 건데 긍정적 일탈은 뭔가요?\n\n스포츠에서 긍정적 일탈의 예시가 뭔지 궁금합니다.\n\n혹시 과도한 훈련이나 도핑 같은 것도 긍정적 일탈인가요?",
    author: "일탈궁금",
    date: "2026-04-09 01:15:00",
    comments: [
      { author: "사회학전공", content: "긍정적 일탈은 사회 규범을 과도하게 따르는 것을 말합니다" },
      { author: "예시공유", content: "과도한 훈련, 부상 무시하고 경기에 출전하는 것 등이 예시예요" },
      { author: "시험팁", content: "이 개념은 기출에 종종 나오니 꼭 정리해두세요" },
    ],
  },
  {
    categoryId: 5,
    title: "자유형 킥할 때 발목 유연성이 중요하더라고요",
    content:
      "킥이 안 나와서 고민이었는데 발목 유연성 문제였어요.\n\n발목이 굳어있으면 킥을 해도 추진력이 안 나옵니다.\n\n매일 발목 포인트하듯 쭉 펴는 스트레칭 하세요.\n\n밴드 이용해서 발가락에 밴드 끼고 돌리는 운동 추천합니다.\n\n시계방향 20번 반시계 20번 3세트 하면 확실히 달라져요.",
    author: "발목유연성팁",
    date: "2026-04-07 15:56:00",
    comments: [
      { author: "감사해요", content: "밴드 운동 바로 해볼게요! 좋은 정보 감사합니다" },
      { author: "발목딱딱", content: "저도 발목이 안 펴져서 고민인데 스트레칭 시작해야겠어요" },
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
