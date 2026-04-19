import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

import { REGION_GROUPS } from "@/app/lib/region-data";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

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

function pickRegion(): string {
  const code = pick(weightedRegionCodes);
  const group = REGION_GROUPS.find((g) => g.code === code);
  if (!group) return "서울특별시 - 강남구";
  const sub = pick(group.subRegions);
  return `${group.name} - ${sub.name}`;
}

interface PostData {
  categoryId: number;
  title: string;
  content: string;
  author: string;
  date: string;
  comments: { author: string; content: string }[];
}

const posts: PostData[] = [
  // ===== 7차 시드: 생활체육지도사2급 Part3 D-4 공부/시험장 준비 (2026-04-12~14) =====

  {
    categoryId: 1,
    title: "24년도 기출 평균 74점... 역대급 어려웠다는게 실감납니다",
    content:
      "23년도 평균 90이상 나왔는데\n24년도는 평균 74점 나왔습니다.\n\n특히 윤리가 역학보다 낮게 나왔어요.\n심리학도 23년도가 최근 3개년 중 제일 어려웠고.\n\n22년 24년이 어렵다는 분들이 많더라구요.\n26년도 제발 쉽게 나와라...",
    author: "토피넛라떼맛",
    date: "2026-04-12 18:14:00",
    comments: [
      { author: "헤이즐넛향긋", content: "23년 평균 90이상인데 24년은 74라니 격차가 심하네요" },
      { author: "바닐라시럽맛", content: "26년 쉽게 나오길 기도합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "19년도 기출을 실전처럼 풀어봤더니 85분 걸렸습니다",
    content:
      "19년도 기출을 실전 시험처럼 타이머 맞춰놓고 풀었는데\n100분 중 85분 걸리더라구요.\n\n사회학 20/14 교육 20/12 심리 20/8\n체육사 20/16 윤리 20/13\n총 315점... 딱 턱걸이.\n\n시간 분배가 정말 중요할 것 같아요.\n사회학에서 22분 걸려서 시간 멘탈이 나갔습니다.",
    author: "크렘브륄레맛",
    date: "2026-04-12 21:35:00",
    comments: [
      { author: "푸딩카스타드", content: "85분이면 빡빡하네요 OMR 마킹 시간도 있으니까" },
      { author: "파르페층층이", content: "사회학에 22분은 좀 오래 걸린 것 같아요 15분 안에 끝내야" },
      { author: "젤라또크림맛", content: "19년도가 어려운 편인데 턱걸이면 잘하신거예요" },
    ],
  },
  {
    categoryId: 1,
    title: "헝그리 모의고사 300점 턱걸이... 멘붕입니다",
    content:
      "헝그리 모의고사 처음 쳤는데 300점 턱걸이.\n\n기출 평균 80점 이상 나오던 사람인데\n모의고사는 처음 보는 문제 투성이라\n멘탈이 완전 나갔습니다.\n\n기출만으로 되는 시험이 아닌 것 같아요.\n이론도 확실히 해야 할 것 같습니다.",
    author: "쿠키앤크림맛",
    date: "2026-04-12 22:29:00",
    comments: [
      { author: "오레오밀크맛", content: "모의고사는 원래 어렵게 나와요 너무 걱정 마세요" },
      { author: "초코칩쿠키맛", content: "기출에서 70% 나오고 나머지 30%는 새로운 이론이래요" },
    ],
  },
  {
    categoryId: 8,
    title: "태권도 반칙 문제 구성적 vs 규제적 정리",
    content:
      "태권도에서 타격 없이는 점수 자체가 안 되는 종목이라\n타격 방식의 변경은 구성적 반칙이고\n경기 중 규칙 위반은 규제적 반칙이에요.\n\n태권도 문제 나오면 무조건 헷갈리는데\n구성 반칙 = 경기 자체가 무너짐\n규제 반칙 = 벌 받고 이어감\n이렇게 외우세요.",
    author: "붕어빵크림맛",
    date: "2026-04-12 19:44:00",
    comments: [
      { author: "잉어빵초코맛", content: "태권도 타격 없으면 점수가 안 되니까 구성적이군요" },
      { author: "국화빵팥소맛", content: "구성 반칙이랑 규제 반칙 매번 헷갈리는데 정리 감사" },
      { author: "풀빵촉촉한맛", content: "의도적이면 규제적 비의도적이면 구성적 맞죠?" },
    ],
  },
  {
    categoryId: 1,
    title: "교육학 스포츠교육모형 특징 외우는법 - 시공합결기축",
    content:
      "스포츠교육모형 특징 외우기 어려운 분들\n\n시즌 공식경기 합산 결산식/축하 기록보존 축제평가\n줄여서 '시공합결기축' 이렇게 외우세요.\n\n2가지 이상 역할을 배우는 것이 핵심이고\n직접교수모형과 헷갈리지 않게 구분하세요.\n\n교육학이 제일 어렵다는 분들 많은데\n키워드 중심으로 외우면 됩니다.",
    author: "마들렌버터향",
    date: "2026-04-13 16:05:00",
    comments: [
      { author: "피낭시에고소", content: "시공합결기축 좋은 암기법이네요 바로 메모" },
      { author: "카눌레바삭맛", content: "교수모형 구분이 진짜 어려운데 도움 됩니다" },
      { author: "크레페딸기맛", content: "스포츠교육모형은 역할이 핵심이죠" },
    ],
  },
  {
    categoryId: 1,
    title: "OMR 마킹 시간이 생각보다 오래 걸립니다",
    content:
      "100문제 OMR 체크하는데만 5~10분 걸리더라구요.\n\n시험지 넘기면서 찾으면서 체크해야 하니까\n실제 문제 풀 시간은 90분 정도밖에 안 돼요.\n\n한 과목 끝나면 바로 마킹하는 사람도 있고\n마지막에 한번에 하는 사람도 있는데\n\n저는 한번에 하다가 답 바뀔까봐 불안해서\n과목별로 바로 마킹하려구요.",
    author: "앙버터소금빵",
    date: "2026-04-13 17:04:00",
    comments: [
      { author: "소금빵바삭한", content: "저도 과목별로 마킹하는게 안전한 것 같아요" },
      { author: "크림빵촉촉맛", content: "수정테이프 사용 가능하니까 두개 챙기세요" },
      { author: "밀크브레드향", content: "마킹 연습 한번 해보는게 좋아요 의외로 시간 잡아먹음" },
    ],
  },
  {
    categoryId: 1,
    title: "수정테이프 사용 가능합니다 - 시험장 준비물 최종 정리",
    content:
      "수정테이프 사용 가능한지 궁금하셨죠?\n\n수정 테이프(화이트) 사용 가능합니다.\n다만 이중으로 칠해지면 오류 처리될 수 있으니\n깨끗하게 덮으세요.\n\n컴퓨터용 싸인펜 2개 + 수정테이프 + 수험표\n이렇게 챙기시면 됩니다.\n\n시험지는 시험 끝나면 가져갈 수 있어요.",
    author: "에그타르트따끈",
    date: "2026-04-13 16:17:00",
    comments: [
      { author: "커스타드크림", content: "수정테이프 가능하군요 다행이다 하나 사야겠어요" },
      { author: "슈크림가득한", content: "싸인펜 빨간색이랑 검은색 둘다 챙기세요" },
    ],
  },
  {
    categoryId: 1,
    title: "AI로 공부하는 분 계세요? 노트북LM 활용 후기",
    content:
      "이번에 공부 방식을 완전 바꿔서\nAI(노트북LM) 활용해서 공부하고 있는데\n참 도움이 많이 됩니다.\n\n기출에서 핵심 내용 뽑아달라고 프롬프트 날리면\n학습용 PPT처럼 만들어줘서 공부하기 좋아요.\n\n퀴즈도 만들어주고 오답노트도 정리해줍니다.\n3회차인데 이론 안 외우면 소용없다는 결론.",
    author: "마카롱세트맛",
    date: "2026-04-13 23:55:00",
    comments: [
      { author: "크로와상층층", content: "AI로 공부하는 시대가 왔군요 나도 해봐야겠다" },
      { author: "베이글크림치즈", content: "노트북LM이 뭔지 몰랐는데 찾아봐야겠어요" },
      { author: "프레첼소금뿌린", content: "결국 외워야 하는건 똑같죠 ㅋㅋ" },
    ],
  },
  {
    categoryId: 1,
    title: "스터디카페에서 공부하는 후기 - 집중력 차이 남",
    content:
      "오늘 처음으로 스터디카페 가봤는데\n집중력이 확실히 다르더라구요.\n\n칸칸이 다 칸막이가 되어있어서 좋고\n프린터도 무료고 음료도 있고.\n\n집에서는 10분 공부 20분 휴식이었는데\n여기서는 40분 공부 10분 휴식 가능합니다.\n\n시험 4일 남은 지금 꼭 가보세요.",
    author: "팥빙수한그릇",
    date: "2026-04-13 13:06:00",
    comments: [
      { author: "눈꽃빙수시원", content: "스터디카페 집중 잘 되죠 저도 다니고 있어요" },
      { author: "망고빙수달콤", content: "프린터 무료인 곳도 있군요 부럽다" },
    ],
  },
  {
    categoryId: 1,
    title: "D-4 마지막 공부 전략 - 기출 오답 + 이론 키워드",
    content:
      "시험 4일 남았습니다.\n\n지금부터는 새로운 이론 보지 마시고\n기출 오답노트 + 핵심 키워드 반복이 정답입니다.\n\n틀린 이유 파악 + 개념 맥락 확인\n이걸로 충분합니다.\n\n시험 당일에는 오답노트만 가져가세요.\n과목당 주요 개념들만 계속 보는게 맞습니다.",
    author: "호떡시나몬꿀",
    date: "2026-04-14 00:02:00",
    comments: [
      { author: "꿀떡달달한맛", content: "새로운거 보면 오히려 더 헷갈리죠 오답 복습이 답" },
      { author: "찰떡콩고물맛", content: "시험장에 오답노트 가져간다 좋은 전략이에요" },
      { author: "백설기촉촉한", content: "4일이면 충분합니다 포기하지 마세요" },
    ],
  },
  {
    categoryId: 1,
    title: "꿈에서 체육사 외우는 꿈 꿨습니다",
    content:
      "시험 준비하다 보니\n꿈에서 체육사 외우는 꿈을 꿨어요.\n\n벌떡 일어났습니다.\n잠에서도 기빨려서 피곤해 죽겠어요.\n\n남편이 옆에서 중얼거리면서 공부하다가\n자는데 혼잣말로 스킬을 중얼거리더라구요.\n\n다들 시험 스트레스 많이 받으시죠?",
    author: "초코파이한박스",
    date: "2026-04-13 09:46:00",
    comments: [
      { author: "바나나우유한컵", content: "ㅋㅋㅋ 꿈에서도 공부하시다니 고생이 많으세요" },
      { author: "멜론소다톡톡", content: "저도 시험 전이면 항상 시험 꿈 꿔요" },
    ],
  },
  {
    categoryId: 1,
    title: "피스트펭귄 기출 15년도까지 다 올라왔네요",
    content:
      "피스트펭귄에 기출 해설이 15년도까지 올라왔더라구요.\n이전에는 19년도까지만 있었는데 오늘 보니까 추가됐어요.\n\n무료 강의도 30분 완성 코스 있고\n과목별 요약도 잘 되어있어서 추천합니다.\n\n앱으로는 안 되고 사이트에서 봐야 해요.\nthe1stpeng.com 입니다.",
    author: "타르트레몬맛",
    date: "2026-04-13 16:45:00",
    comments: [
      { author: "슈크림타르트", content: "오 15년까지 나왔군요 고마운 정보" },
      { author: "블루베리타르트", content: "피스트펭귄 30분 완성 추천합니다 핵심만 쏙쏙" },
    ],
  },
  {
    categoryId: 1,
    title: "생리학 포기하고 심리학으로 바꿨습니다 - 3일 전인데",
    content:
      "생리학이 도저히 안 되겠어서\n3일 전인데 심리학으로 바꿨어요.\n\n생리학은 용어 자체가 너무 어렵고\n역학도 계산이 안 맞아서 포기.\n\n심리학이 양은 많지만 한번 이해하면\n문제 풀 때 소거법으로 맞출 수 있더라구요.\n\n지금이라도 바꾸는게 맞는 것 같습니다.",
    author: "와플크림듬뿍",
    date: "2026-04-12 21:23:00",
    comments: [
      { author: "팬케이크메이플", content: "과감한 선택 응원합니다 심리학이 확실히 나아요" },
      { author: "토스트잼발라맛", content: "3일이면 심리학 기출 3회독 가능합니다 화이팅" },
      { author: "식빵두툼한맛", content: "저도 생리학에서 심리학으로 바꿔서 합격했어요" },
    ],
  },
  {
    categoryId: 1,
    title: "윤리가 의외로 어렵습니다 - 쉽다고 한 사람 누구",
    content:
      "윤리가 쉽다길래 편하게 생각했는데\n막상 기출 풀면 점수가 왔다갔다 합니다.\n\n의무론적 윤리 공리주의 이런 개념은 쉬운데\n보기에서 미묘하게 꼬아놓으면 헷갈려요.\n\n특히 24년도 윤리가 어려웠다는 분들 많고\n저도 체감상 가장 점수가 불안정한 과목입니다.",
    author: "약과꿀시럽맛",
    date: "2026-04-12 18:55:00",
    comments: [
      { author: "한과고소한맛", content: "윤리 쉬운 종목인줄 알았는데 의외로 복병이에요" },
      { author: "유과바삭한맛", content: "공리주의 의무론 딱 두가지만 확실히 구분하면 됩니다" },
      { author: "강정달콤한맛", content: "24년 윤리가 특히 어려웠어요 공감" },
    ],
  },
  {
    categoryId: 14,
    title: "축구 종목인데 시험 후 실기 걱정됩니다",
    content:
      "축구는 지금 자격증이 2개 필수라고 하네요.\nP급이랑 이 전문스포츠지도사.\n\n법이 바뀌면서 자격증 없이 지도하면\n안 되는 시대가 왔습니다.\n\n필기 합격하고 나서 실기 구술이 진짜 걱정인데\n다들 어떻게 준비하시나요?",
    author: "떡갈비양념맛",
    date: "2026-04-12 23:27:00",
    comments: [
      { author: "갈비찜한접시", content: "축구는 P급까지 있어야 하니 빡세죠" },
      { author: "불갈비소스맛", content: "일단 필기 붙고 생각합시다 화이팅" },
    ],
  },
  {
    categoryId: 1,
    title: "보디빌딩 실기가 걱정되는 분들 - 포즈만 잘하면 됩니다",
    content:
      "보디빌딩 실기는 다른 종목보다 쉽다고 합니다.\n\n기본적으로 포즈만 정확하면 되고\n몸이 빵빵 아니어도 괜찮대요.\n\n구술은 300문제 정도 범위인데\n일주일이면 충분하다고 하더라구요.\n\n보디빌딩 선택하신 분들 너무 걱정 마세요.",
    author: "순대국밥뜨끈",
    date: "2026-04-12 23:00:00",
    comments: [
      { author: "설렁탕맑은맛", content: "포즈만 잘하면 된다니 다행이네요" },
      { author: "곰탕진한맛좋", content: "구술 300문제는 좀 많긴 한데 반복하면 됩니다" },
      { author: "갈비탕뜨끈한", content: "보디빌딩이 다른 종목보다 실기 난이도 낮아요" },
    ],
  },
  {
    categoryId: 1,
    title: "25년도가 쉬웠다면 26년도는 어려울까요?",
    content:
      "25년도가 역대급 쉬웠다고 하잖아요.\n합격자가 너무 많이 나와서 실기장이 부족했다는데.\n\n그래서 26년도는 난이도를 올릴 거라는 소문이 있어요.\n\n24년도처럼 어렵게 나올지\n아니면 평이하게 나올지 아무도 모르겠지만\n\n어렵다고 생각하고 더 열심히 하는게 답입니다.",
    author: "군고구마달콤맛",
    date: "2026-04-13 22:27:00",
    comments: [
      { author: "고구마라떼맛", content: "어려울 거라 각오하고 공부하는게 낫죠" },
      { author: "고구마칩바삭", content: "25년 합격률이 높아서 이번엔 빡셀 것 같아요" },
    ],
  },
  {
    categoryId: 1,
    title: "기출 3번째 풀었더니 답이 외워져버렸어요",
    content:
      "기출을 3번째 반복해서 풀고 있는데\n이제 답이 외워져버렸어요.\n\n이게 이론을 외운 건지 답을 외운 건지\n구분이 안 갑니다.\n\n그래도 왜 정답인지 설명할 수 있으면\n괜찮다고 하더라구요.\n\n설명 못하면 아직 부족한 거겠죠?",
    author: "치즈스틱짭짤",
    date: "2026-04-13 21:40:00",
    comments: [
      { author: "감자튀김바삭", content: "답이 외워지는건 자연스러운거예요 이론 이해가 중요" },
      { author: "고구마스틱맛", content: "왜 정답인지 설명 가능하면 충분합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "체육사 빡공하니까 다른걸 까먹습니다",
    content:
      "체육사 빡공하는데\n다른 과목을 까먹어버렸어요.\n\n교육학 심리학 빡세서 하고 오면\n체육사가 초기화되고\n체육사 하면 심리학이 날아가고.\n\n이게 반복이더라구요.\n\n결국 5과목 균형있게 돌려야 하는데\n시간이 부족합니다.",
    author: "크로플바삭맛",
    date: "2026-04-13 17:39:00",
    comments: [
      { author: "와플시럽듬뿍", content: "한 과목 빡세게 하면 다른게 날아가는거 공감" },
      { author: "팬케이크버터", content: "하루에 5과목 조금씩 돌리는게 맞는 것 같아요" },
      { author: "식빵잼바른맛", content: "체육사는 흐름만 잡으면 금방 다시 돌아와요" },
    ],
  },
  {
    categoryId: 1,
    title: "사회학에서 이동과 이탈 헷갈리는 분들 정리",
    content:
      "이동(mobility)과 이탈은 다른 개념이에요.\n\n이동: 같은 계층 내에서 더 좋은 위치로 올라감\n예) 은메달리스트가 금메달리스트로\n\n이탈(인터내셔널): 원래 없던 다른 계층으로 감\n예) 축구 선수의 아들이 아버지보다 더 좋은 조건\n\n이동은 수직이동, 이탈은 세대 간 이동입니다.",
    author: "떡볶이매콤맛",
    date: "2026-04-13 12:42:00",
    comments: [
      { author: "순대소금찍어", content: "이동이랑 이탈 구분 정리 감사합니다" },
      { author: "오뎅국물따끈", content: "이동은 같은 세대 이탈은 세대 간 이해했어요" },
    ],
  },
  {
    categoryId: 1,
    title: "시험장 주차가 안 됩니다 - 대중교통 이용하세요",
    content:
      "시험장이 대학교인데\n주차가 거의 안 됩니다.\n\n주차장이 차 있으면 끝이에요.\n새벽부터 나가야 할 것 같습니다.\n\n대중교통으로 가시는 분들은\n시험장 위치 다시 한번 체크하세요.\n\n9시 30분까지 입실이니까 여유롭게 가세요.",
    author: "와사비맛간장",
    date: "2026-04-13 15:51:00",
    comments: [
      { author: "간장게장맛좋", content: "주차 안 되는건 진짜 스트레스 대중교통 추천" },
      { author: "양념게장매콤", content: "일찍 가서 차에서 공부하다가 입실하는 방법도" },
    ],
  },
  {
    categoryId: 22,
    title: "필라테스 강사인데 비전공자라 힘드네요",
    content:
      "필라테스 강사로 일하면서 자격증 따는 중인데\n비전공자라 용어가 너무 어려워요.\n\n해부학이나 생리학 배경이 있는 분들은\n수월하다고 하는데 저는 처음 보는 단어 투성이.\n\n그래도 현장에서 일하면서 배운 게 있어서\n심리학이나 교육학은 좀 수월한 편이에요.",
    author: "미니핫도그맛",
    date: "2026-04-13 00:18:00",
    comments: [
      { author: "콘치즈핫도그", content: "현장 경험이 있으면 기출이 더 이해 잘 될 거예요" },
      { author: "감자핫도그짭", content: "비전공자도 합격 많이 합니다 화이팅" },
    ],
  },
  {
    categoryId: 1,
    title: "에듀윌 교재 읽는데 졸립고 헝그리 영상이 더 낫습니다",
    content:
      "에듀윌 교재는 백과사전급 분량이라\n읽다 보면 졸립니다.\n\n헝그리 강의 30분짜리 듣는게\n훨씬 효율적이더라구요.\n\n에듀윌은 내용은 많은데 정리가 안 되고\n헝그리는 핵심만 쏙쏙 알려줘서 편해요.\n\n남은 기간에는 헝그리 위주로 하려구요.",
    author: "꿀호떡뜨끈한",
    date: "2026-04-13 21:29:00",
    comments: [
      { author: "팥죽따끈한맛", content: "에듀윌 분량이 너무 많아서 벼락치기에는 안 맞아요" },
      { author: "호두파이바삭", content: "헝그리 30분 완성 강추합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "공부 3일 만에 합격한 사람도 있다고 합니다",
    content:
      "친구가 공부 3일 만에 300점으로 합격했대요.\n\n운이 좋았다기보다는\n기본적으로 체육을 오래 해온 사람이라\n지식이 쌓여있었던 거죠.\n\n비전공자분들은 최소 1~2주는 필요한 것 같고\n전공자분들은 기출만 돌려도 합격 가능합니다.",
    author: "타르트딸기올린",
    date: "2026-04-13 17:30:00",
    comments: [
      { author: "슈크림가득한", content: "3일은 진짜 전공자만 가능한 것 같아요" },
      { author: "카스타드크림", content: "비전공자는 2주는 해야 안전합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "심리학 자기조절 이론에서 자유도/제어 쉽게 이해하기",
    content:
      "다이내믹 시스템 이론에서 자유도와 제어 개념 정리합니다.\n\n자유도: 몸의 움직임의 수. 초보자는 많은 자유도를 줄이려고 함\n제어: 환경에 따른 조절\n\n근육을 필 때 '자유도'라는 것 아시죠?\n다 같이 필 때 자유도.\n\n자유도가 먼저이고 제어가 두번째입니다.\n몸을 먼저 좀 쓸 줄 알아야 상황에 맞춰서 쓸 수 있으니까.",
    author: "크로와상버터",
    date: "2026-04-13 13:26:00",
    comments: [
      { author: "베이글크림맛", content: "자유도 먼저 제어 나중 이해됐습니다" },
      { author: "프레첼소금맛", content: "다이내믹 시스템은 환경과 몸의 상호작용이죠" },
    ],
  },
  {
    categoryId: 1,
    title: "갈등이론 정리 - 지배계급이 피지배계층 착취한다",
    content:
      "갈등이론 문제 나올 때 핵심은\n지배 계급이 피지배 계층을 착취한다!\n\n3S정책(SEX SCREEN SPORTS)으로\n피지배계층 눈 돌리게 하는 것도 갈등이론.\n\n구조기능이론과 헷갈리지 않게\n갈등이론 = 계급 간 착취\n구조기능 = 서로 보완하며 사회 유지\n이렇게 구분하세요.",
    author: "바게트버터맛",
    date: "2026-04-13 15:08:00",
    comments: [
      { author: "치아바타촉촉", content: "갈등이론은 착취 구조기능은 보완 정리 감사" },
      { author: "포카치아맛좋", content: "3S정책이 갈등이론이었군요 기억에 남네요" },
    ],
  },
  {
    categoryId: 32,
    title: "요가 종목인데 실기 걱정 없어서 좋습니다",
    content:
      "요가 종목 선택했는데\n실기가 비교적 편하다고 해서 다행이에요.\n\n포즈만 정확하면 되고\n구술도 범위가 좁은 편이라\n\n필기만 합격하면 나머지는 수월할 것 같습니다.\n다들 필기 먼저 합격하고 나서 생각합시다!",
    author: "떡꼬치매콤달",
    date: "2026-04-12 23:20:00",
    comments: [
      { author: "어묵꼬치따끈", content: "요가 포즈 연습만 잘하면 실기는 괜찮아요" },
    ],
  },
  {
    categoryId: 1,
    title: "사회학 사회이동 이론 쉽게 정리 - 범주/관계/문화",
    content:
      "사회학 미디어 이론이 헷갈리는 분들\n\n개인차이론: 생물심리학적. 키가 커서 농구함\n사회관계이론: 우리 아빠가 축구 좋아해서 나도\n사회범주이론: 상류층이 골프하는데 나도 상류층이라\n사회문화이론: 한국사회에서 박지성 영향으로 축구 좋아해\n\n이렇게 예시로 외우면 기억에 잘 남아요.",
    author: "핫도그케찹맛",
    date: "2026-04-12 18:28:00",
    comments: [
      { author: "콘도그소스맛", content: "예시가 있으니 이해가 잘 되네요 감사합니다" },
      { author: "치즈핫도그맛", content: "개인차 관계 범주 문화 순서대로 외우면 되겠네요" },
      { author: "감자핫도그맛", content: "사회문화이론은 한국사회 맥락으로 이해하니 쉽다" },
    ],
  },
  {
    categoryId: 1,
    title: "교육학 법 조항이 너무 많아서 포기할까 고민",
    content:
      "교육학에 법 조항이 너무 많습니다.\n학교스포츠클럽, 스포츠강사, 체육진흥법 등등.\n\n근데 기출에서 나오는 법 문제는 한정되어있어서\n과락만 면하면 되는 수준이면\n기출에 나온 것만 외우세요.\n\n전체를 다 외우려면 미쳐버립니다.",
    author: "만두찐만두맛",
    date: "2026-04-13 12:39:00",
    comments: [
      { author: "교자만두바삭", content: "법 조항은 기출에 나온 것만 외우는게 현실적" },
      { author: "물만두육즙맛", content: "교육학 법 빼고는 반복하면 금방 외워져요" },
    ],
  },
  {
    categoryId: 1,
    title: "심리학 동기이론 정리 - 내재적/외재적 핵심만",
    content:
      "심리학 동기이론 헷갈리는 분들\n\n외재적 동기 4단계:\n1. 외적 조절 - 피하기 싫어서\n2. 의무감 규제 - 부모님 때문에\n3. 확인 규제 - 목표가 있어서\n4. 통합 규제 - 그냥 그 일이 나다\n\n1번에서 4번으로 갈수록 자기결정성이 높아집니다.\n쉽게 말하면 점점 진심이 되는 거예요.",
    author: "짜장면곱빼기",
    date: "2026-04-12 20:34:00",
    comments: [
      { author: "짬뽕얼큰한맛", content: "점점 진심이 되는거 이해 쉽네요 감사" },
      { author: "볶음밥황금맛", content: "외적조절부터 통합규제까지 순서 외우기 쉬워요" },
    ],
  },
  {
    categoryId: 1,
    title: "기출 평균 80이상인데 모의고사 치면 턱걸이입니다",
    content:
      "기출은 평균 80이상 나오는데\n모의고사나 헝그리 사설 문제 풀면\n300점 턱걸이가 나옵니다.\n\n기출은 이미 3번째라 답이 외워져서 높은 거고\n실제 시험은 처음 보는 문제니까\n더 떨어질 수 있다는 게 무서워요.\n\n기출 80이면 실전 60정도 예상해야 하나요?",
    author: "카스테라촉촉",
    date: "2026-04-13 21:09:00",
    comments: [
      { author: "파운드케이크", content: "기출 80이면 실전도 충분할 거예요 너무 걱정 마세요" },
      { author: "롤케이크맛좋", content: "처음 풀었을 때 기출 점수가 실력이에요" },
      { author: "쉬폰케이크맛", content: "기출이랑 비슷하게 나온다고 하니까 80이면 안전권" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 당일 아침에 뭐 먹고 가시나요",
    content:
      "시험 당일 아침에 뭐 먹고 가시나요?\n\n에너지 드링크 빵 먹고 갔다가\n중간에 화장실 참느라 고생한 적 있어서.\n\n커피는 카페인 때문에 화장실 문제라\n안 먹는게 나을 것 같고.\n\n가볍게 바나나 + 꿀물 정도가 적당할까요?",
    author: "솜사탕핑크맛",
    date: "2026-04-13 20:22:00",
    comments: [
      { author: "목화솜달콤맛", content: "바나나가 제일 무난해요 시험 전에 새로운거 먹지 마세요" },
      { author: "구름솜달달맛", content: "커피는 진짜 비추 화장실 급해지면 큰일" },
    ],
  },
  {
    categoryId: 42,
    title: "테니스 종목인데 실기 어렵다고 해서 걱정됩니다",
    content:
      "테니스 실기가 좀 어렵다고 들었는데\n구체적으로 어떤 부분이 어려운가요?\n\n필기는 어떻게든 넘기겠는데\n실기 구술이 300문제라\n외울 게 산더미입니다.\n\n테니스 경험 있으신 분 조언 부탁드립니다.",
    author: "떡튀순한세트",
    date: "2026-04-13 15:01:00",
    comments: [
      { author: "순대곱창볶음", content: "실기는 기본기가 탄탄하면 괜찮아요" },
      { author: "떡볶이치즈맛", content: "구술은 교본 기준으로 암기하면 됩니다" },
    ],
  },
  {
    categoryId: 1,
    title: "이번 주 토요일 시험인데 날씨 좋았으면",
    content:
      "4월 18일 토요일 시험인데\n날씨가 좋았으면 좋겠습니다.\n\n비 오면 멘탈이 더 힘들어지고\n시험장까지 가는 것도 힘들어요.\n\n다들 기분 좋은 마음으로 시험 보고\n좋은 결과 있길 바랍니다!\n\n이번 주 마지막까지 화이팅!",
    author: "핫초코달달맛",
    date: "2026-04-14 00:12:00",
    comments: [
      { author: "코코아포근맛", content: "날씨도 좋고 시험도 잘 보길 기도합니다" },
      { author: "밀크티부드런", content: "다들 합격합시다!!" },
      { author: "녹차라떼진한", content: "마지막 주 화이팅입니다 다들 고생하셨어요" },
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
      const randomViews = Math.floor(Math.random() * 81) + 20;

      const result = await sql`
        INSERT INTO posts (category_id, title, content, author, password, region, tags, ip_address, created_at, updated_at, views)
        VALUES (${post.categoryId}, ${post.title}, ${post.content}, ${post.author}, ${"__seed_community__"}, ${region}, ${"기타"}, ${"seed_community"}, ${post.date}::timestamp, ${post.date}::timestamp, ${randomViews})
        RETURNING id
      `;
      postsInserted++;

      const postId = result[0]?.id;
      if (!postId) continue;

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
