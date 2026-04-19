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
  // ===== 6차 시드: 생활체육지도사2급 필기준비방 게시글 (2026-04-09 ~ 2026-04-12) =====

  // --- 1. 과목 선택 고민 ---
  {
    categoryId: 1,
    title: "심리학 vs 생리학 vs 역학 과목 선택 고민입니다",
    content:
      "선택과목 고민이 끝이 없네요.\n\n심리학은 양이 너무 많고 용어가 헷갈리고\n생리학은 전공 배경 없으면 어렵다고 하고\n역학은 계산 문제라서 빼려는 분도 많더라구요.\n\n카톡방에서는 전공자면 심리+생리 추천하고\n암기 잘하시면 심리+체육사 추천한다고 하네요.\n\n저는 비전공자인데 역학이 단시간에 제일 낫다는 말에 혹해서\n심리에서 역학으로 바꿨습니다.\n\n다들 어떤 과목 선택하셨나요?",
    author: "딸기모찌쫀득",
    date: "2026-04-09 14:30:00",
    comments: [
      { author: "수박화채시원", content: "저도 심리 풀다가 스트레스 받아서 역학으로 바꿨어요" },
      { author: "참외아이스맛", content: "역학이 단시간 준비하기엔 제일 나은 것 같아요" },
      { author: "복숭아잼달콤", content: "생리학은 생물 배경 있으면 수월한데 없으면 힘들어요" },
    ],
  },
  {
    categoryId: 1,
    title: "생리학 선택하신 분 계세요? 용어가 너무 어려워요",
    content:
      "생리학 선택했는데 용어가 진짜 어렵네요.\n\n전공자분들은 수월하다고 하시는데\n저같은 비전공자는 처음 보는 단어 투성이예요.\n\n지금이라도 심리학으로 바꿔야 하나 고민되는데\n심리학도 양이 장난 아니라고 하니까\n\n이러지도 저러지도 못하는 상황입니다 ㅠㅠ",
    author: "초코파이한박스",
    date: "2026-04-09 21:01:00",
    comments: [
      { author: "바나나우유맛", content: "전공 배경 없으면 심리가 그나마 나아요 양만 많지 이해는 되거든요" },
      { author: "멜론소다톡톡", content: "생리학 역학 심리학 셋 다 하는데 역학이 제일 쉬워요" },
    ],
  },

  // --- 2. 기출문제 반복 학습법 후기 ---
  {
    categoryId: 1,
    title: "기출 10번째 푸는 중인데 점수가 안 올라요",
    content:
      "22년부터 25년 기출 10번째 돌리는 중입니다.\n\n근데 점수가 더 이상 안 올라요.\n기출 풀 때는 80점 이상 나오는데\n사설 모의고사 풀면 멘탈이 나가더라구요.\n\n강의에서 안중요하다고 스킵한 부분이\n모의고사에서 나오니까 풀 수가 없어요.\n\n기출만으로 되는 시험인건지 불안합니다.",
    author: "꿀호떡뜨끈한",
    date: "2026-04-09 17:26:00",
    comments: [
      { author: "팥죽따끈한맛", content: "기출은 방향잡기용이고 개념 숙지가 더 중요한 것 같아요" },
      { author: "호두파이바삭", content: "사설 모의고사는 원래 어려워요 너무 신경 쓰지 마세요" },
      { author: "잣죽고소한맛", content: "10번 푸신건 대단해요 저는 3번째인데 문제를 외워버림" },
    ],
  },
  {
    categoryId: 5,
    title: "기출 반복 학습법 공유합니다 - 강의 3번 듣기",
    content:
      "저는 암기를 따로 안 하고\n강의를 과목당 3번씩 반복해서 들었어요.\n\n이해 위주로 듣다 보면 머리가 알아서 저장해주더라구요.\n\n그 다음에 기출 풀면 점수가 잘 나오는데\n사설 문제는 안 나오던 내용이 나와서 무너집니다.\n\n그래도 시험은 기출 출제 교수가 내는 거니까\n기출 유형이랑 비슷하지 않을까 기대 중이에요.",
    author: "치즈스틱짭짤",
    date: "2026-04-09 15:40:00",
    comments: [
      { author: "감자튀김바삭", content: "강의 3번 듣기 좋은 방법이네요 저도 따라해봐야겠어요" },
      { author: "고구마스틱맛", content: "암기만 하면 문제 꼬아서 내면 못 풀더라구요 이해가 중요" },
    ],
  },

  // --- 3. 교육학 교수모형이 어렵다 ---
  {
    categoryId: 1,
    title: "교육학 교수모형 진짜 미치겠습니다",
    content:
      "스포츠교육모형 직접교수모형 개별화지도모형\n이거 구분이 안 돼요 진짜로.\n\n심동적 영역 우선순위가 모형마다 다르고\n코치인지 선수인지에 따라 또 달라진다니\n\n머리가 터질 것 같습니다.\n\n교육학이 사회학보다 어려운 것 같아요.\n다들 교육학 어떻게 공부하시나요?",
    author: "크로와상버터",
    date: "2026-04-09 17:15:00",
    comments: [
      { author: "베이글크림맛", content: "교수모형은 표로 정리해서 비교하면서 외우는게 제일 나아요" },
      { author: "프레첼소금맛", content: "직접교수모형이랑 개별화지도는 심동적 1순위 맞아요" },
      { author: "스콘블루베리", content: "스포츠교육모형은 역할마다 다르니까 구체적으로 나눠서 암기하세요" },
      { author: "잉글리시머핀", content: "교육학이 제일 어려운건 동의합니다 사회학보다 심함" },
    ],
  },

  // --- 4. 기출 점수 공유 ---
  {
    categoryId: 1,
    title: "22~25년 기출 평균 80점인데 불안합니다",
    content:
      "20년부터 25년까지 기출 다 풀어봤는데\n22년부터는 평균 80점 이상 나옵니다.\n\n근데 21년도는 79점이었고\n17년도는 겨우 걸쳤어요.\n\n기출 점수 80 이상이면 안전빵이라는 소리도 있고\n정작 시험장 가면 다르다는 말도 있고.\n\n23~25년도 기출은 쉽게 느껴지는데\n26년도 실제 시험은 어떨지 걱정됩니다.",
    author: "와플크림듬뿍",
    date: "2026-04-09 17:53:00",
    comments: [
      { author: "팬케이크메이플", content: "80이면 안전권인데 시험장 분위기가 달라서 긴장되죠" },
      { author: "토스트잼발라", content: "24년도가 제일 어려웠다는 분들 많더라구요" },
      { author: "식빵두툼한맛", content: "기출은 쉽고 실전은 어렵다 항상 그래요" },
    ],
  },

  // --- 5. 시험장 준비물 ---
  {
    categoryId: 1,
    title: "시험장 준비물 정리 - 컴퓨터용 싸인펜 꼭 새거로",
    content:
      "수험표 출력하셨나요? 교실 몇번째 자리인지 나와있어요.\n\n컴퓨터용 싸인펜은 새 걸로 2개 사서 가세요.\n집에 굴러다니는 거 가져갔다가 안 나오면 멘붕입니다.\n\n핸드폰은 시험 전에 끄면 되고\n100분 시험 끝나고 나가야 시험지 가져갈 수 있어요.\n\n다들 준비물 빠짐없이 챙기세요!",
    author: "타르트딸기올린",
    date: "2026-04-10 07:19:00",
    comments: [
      { author: "슈크림가득한", content: "싸인펜 두개 사뒀어요 혹시 몰라서" },
      { author: "카스타드크림", content: "수험표 출력 깜빡할뻔 감사합니다" },
      { author: "밀크크림빵맛", content: "시계도 꼭 가져가세요 교실에 없는 경우도 있대요" },
    ],
  },

  // --- 6. 시험 시간 100분 활용법 ---
  {
    categoryId: 3,
    title: "100분 시험 시간 분배 어떻게 하시나요",
    content:
      "100분에 100문제면 1분에 1문제인데\n실제로는 어려운 문제에서 시간 잡아먹으니까\n시간 분배가 중요할 것 같아요.\n\n쉬운 과목 먼저 빠르게 풀고\n어려운 과목에 시간 투자하는 전략이 좋을까요?\n\n아니면 순서대로 풀되 모르면 바로 넘기고\n마지막에 찍는게 나을까요?",
    author: "약과꿀시럽맛",
    date: "2026-04-10 08:35:00",
    comments: [
      { author: "한과고소한맛", content: "모르면 바로 넘기고 나중에 다시 보는게 시간절약 됩니다" },
      { author: "유과바삭한맛", content: "저는 쉬운 과목부터 풀어서 자신감 얻고 시작해요" },
    ],
  },

  // --- 7. 구성적 규칙 vs 규제적 규칙 헷갈림 ---
  {
    categoryId: 1,
    title: "구성적 규칙 vs 규제적 규칙 정리해봤습니다",
    content:
      "이거 진짜 헷갈리는 분 많으시죠?\n\n쉽게 정리하면 이렇습니다.\n\n구성적 규칙: 게임의 기본 틀, 없으면 게임 성립 안됨\n예) 축구는 발로 해야 한다\n\n규제적 규칙: 벌칙을 부여하는 규칙, 게임 진행 중 적용\n예) 핸드볼 하면 프리킥\n\n핵심은 페널티를 만드는 것은 구성적, 페널티를 주는 것은 규제적입니다.\n\n구성은 게임 외, 규제는 게임 내로 단순하게 보시면 편해요.",
    author: "떡볶이매콤한",
    date: "2026-04-09 14:48:00",
    comments: [
      { author: "순대소금찍어", content: "이거 보니까 이해가 되네요 감사합니다" },
      { author: "오뎅국물따끈", content: "규제를 만드는 것도 구성이라 낚이지 않게 조심해야 해요" },
      { author: "어묵탕뜨끈한", content: "보기에 섞어 놓으면 진짜 헷갈리겠네요" },
      { author: "튀김바삭소리", content: "구성 없으면 게임 자체가 안되니까 실격이죠" },
    ],
  },

  // --- 8. 오답노트 작성법 ---
  {
    categoryId: 1,
    title: "오답노트 작성법 공유 - 틀린 이유까지 적기",
    content:
      "오답노트 쓰시는 분들 팁 공유합니다.\n\n저는 틀린 문제만 적는게 아니라\n맞는 보기에서 틀린 보기가 왜 틀린건지까지 적어요.\n\n이해하려고 노력하면서 적으니까\n같은 유형 나와도 틀리지 않게 되더라구요.\n\n하루에 1시간씩 기출 풀고\n틀리면 오답노트 적고 다음날 복습하는 루틴입니다.",
    author: "붕어빵팥가득",
    date: "2026-04-09 21:12:00",
    comments: [
      { author: "잉어빵슈크림", content: "왜 틀린지까지 적는게 진짜 중요하죠 공감합니다" },
      { author: "국화빵앙금맛", content: "저도 오답노트 쓰는데 10분 뒤면 다 까먹어요 ㅋㅋ" },
      { author: "풀빵고소한맛", content: "뇌 메모리에 추가하겠습니다 감사합니다" },
    ],
  },

  // --- 9. 직장인/40대~60대 수험생 응원 ---
  {
    categoryId: 1,
    title: "40대에 공부하려니 죽겠습니다 ㅋㅋ",
    content:
      "40대 직장인인데 퇴근하고 공부하려니 진짜 힘드네요.\n\n외우고 다른 과목 하고 오면 다 까먹고\n문제 보면 뭔 말인지도 모르겠고.\n\n50넘어서 하시는 분도 계시고 60대까지 계신다고 하니\n저는 양반인가 싶기도 하고.\n\n나이 먹으니 머리가 안 돌아가는데\n다들 화이팅합시다!",
    author: "누룽지바삭한",
    date: "2026-04-10 09:30:00",
    comments: [
      { author: "숭늉구수한맛", content: "40대 50대 분들 많아요 혼자가 아닙니다 화이팅" },
      { author: "밥알볶음밥맛", content: "직장 다니면서 따시는 분들 존경합니다" },
      { author: "김밥한줄뚝딱", content: "보디빌딩만 어린 친구들 많고 나머지는 연령대 높아요" },
    ],
  },
  {
    categoryId: 22,
    title: "직장인 수험생 응원합니다 - 본인을 의심하지 마세요",
    content:
      "다들 불안하시죠? 저도 불안합니다.\n\n근데 본인 자신을 의심하지 마세요.\n후회없이 최선을 다해보세요.\n\n1년에 1번만 있는 시험이라 부담이 크지만\n여러분의 노력은 절대 배신하지 않을거예요.\n\n떨어지면 내년에 다시 보면 되잖아요.\n같이 이번년도 마무리합시다!",
    author: "마시멜로솜사탕",
    date: "2026-04-09 21:40:00",
    comments: [
      { author: "솜사탕딸기맛", content: "감동입니다 화이팅 하겠습니다" },
      { author: "구름빵폭신한", content: "다음년도는 더 빡셀 것 같으니 이번에 붙읍시다" },
    ],
  },

  // --- 10. 헝그리스포츠/에듀윌/퍼스트펭귄 교재 비교 ---
  {
    categoryId: 1,
    title: "헝그리스포츠 vs 에듀윌 vs 퍼스트펭귄 교재 비교 후기",
    content:
      "세 교재 다 써본 후기입니다.\n\n에듀윌: 백과사전급 분량, 정리는 잘 되어있는데 양이 미쳤음\n헝그리스포츠: 기출 분석이 좋고 강의가 괜찮음, 기출문제집 추천\n퍼스트펭귄: 기출 풀기 좋고 7일 벼락치기 코스 있음\n\n에듀윌로 이론 보고 헝그리로 기출 돌리는 분이 많더라구요.\n\n에듀윌만으로는 기출 스타일이 안 잡히고\n헝그리만으로는 이론이 부족한 느낌입니다.",
    author: "미니핫도그맛",
    date: "2026-04-09 20:57:00",
    comments: [
      { author: "콘치즈핫도그", content: "에듀윌 백과사전이랑 씨름 중입니다 ㅋㅋ" },
      { author: "감자핫도그짭", content: "퍼스트펭귄으로 기출 풀었는데 괜찮았어요" },
      { author: "소시지빵한입", content: "헝그리 기출문제집이 예상기출도 줘서 좋아요" },
      { author: "크림치즈빵맛", content: "에듀윌 이론 + 헝그리 기출 조합이 최강인 것 같아요" },
    ],
  },
  {
    categoryId: 1,
    title: "에듀윌로만 공부하시는 분 계세요?",
    content:
      "에듀윌 교재로만 공부하고 있는데\n2회독도 못 했어요 아직.\n\n지금이라도 헝그리 사는게 나을까요?\n헝그리 책 없이 에듀윌만으로 강의 들으면 문제없나요?\n\n에듀윌이 정리는 잘 되어있는데\n양이 너무 많아서 다 외울 엄두가 안 납니다.",
    author: "쿠키앤크림맛",
    date: "2026-04-09 21:40:00",
    comments: [
      { author: "민트초코아이스", content: "에듀윌만으로도 충분해요 기출만 추가로 풀면 됩니다" },
      { author: "바닐라빈라떼", content: "헝그리 유튜브 무료강의 2시간짜리 있어요 그거 들어보세요" },
    ],
  },

  // --- 11. 벼락치기 5일 공부법 ---
  {
    categoryId: 1,
    title: "7일 벼락치기 가능할까요? 월요일부터 시작했습니다",
    content:
      "이번주 월요일부터 시작했어요.\n\n교육학 사회학 윤리학은 필수로 하고\n나머지 2과목은 심리+체육사로 갈 예정입니다.\n\n역학은 계산문제라서 뺐어요.\n\n하루에 한 과목씩 끝내는 게 목표인데\n기출까지 풀 시간이 없을 것 같아요 ㅠㅠ\n\n미쳤다 생각하고 강의 듣고 3일 후 기출 풀면 승산 있을까요?",
    author: "크래커치즈맛",
    date: "2026-04-09 17:29:00",
    comments: [
      { author: "리츠크래커맛", content: "퍼스트펭귄 7일 준비 코스 있어요 하루 한과목 가능합니다" },
      { author: "그래놀라바맛", content: "강의 듣고 기출 바로 풀면 됩니다 시간 없으면 기출 위주로" },
      { author: "시리얼우유맛", content: "월요일부터면 충분해요 집중하면 됩니다 화이팅" },
    ],
  },
  {
    categoryId: 7,
    title: "9일 남았는데 윤리 하나만 끝난 상태입니다",
    content:
      "9일 남았는데 윤리 하나만 끝났어요.\n\n이거 가능한 건가요?\n\n나머지 4과목을 8일 안에 끝내야 하는데\n하루에 두과목씩 해야 하는 상황.\n\n잠 줄이고 하루 12시간 이상 공부하면\n될까요? 안 될까요?\n\n포기하고 싶은 마음과 싸우는 중입니다.",
    author: "카라멜팝콘맛",
    date: "2026-04-09 23:01:00",
    comments: [
      { author: "버터팝콘향긋", content: "포기하지 마세요 9일이면 충분합니다 집중만 하면" },
      { author: "치즈팝콘짭짤", content: "기출 위주로 돌리면 단시간에 가능해요" },
    ],
  },

  // --- 12. 26년 모의고사 난이도 후기 ---
  {
    categoryId: 1,
    title: "에듀윌 26년 모의고사 풀었는데 멘탈 나갔어요",
    content:
      "에듀윌 26년 모의고사 풀어봤는데\n기출이랑 유형이 완전 다르네요.\n\n기출에서는 안 나오던 서양사상 문제가 잔뜩 나오고\n가이던스라는 단어 처음 들어봤어요.\n\n기출 풀면 80점 넘는데\n모의고사 풀면 무너집니다.\n\n사설 모의고사가 원래 이렇게 어려운 건가요?\n실제 시험은 기출 수준이길 바랍니다.",
    author: "젤리빈알록달록",
    date: "2026-04-09 15:47:00",
    comments: [
      { author: "곰젤리말랑말랑", content: "모의고사는 원래 어렵게 만들어요 실전 대비용이니까" },
      { author: "구미베어탱글", content: "기출 수준이면 좋겠는데 매년 난이도 달라져서 불안하죠" },
      { author: "하리보골드곰", content: "가이던스 ㅋㅋ 저도 처음 봤어요 이게 뭔데 싶었음" },
    ],
  },
  {
    categoryId: 8,
    title: "헝그리 모의고사 풀고 멘탈 터졌습니다",
    content:
      "헝그리스포츠 모의고사 풀었는데\n이거 뭔 말인지 하나도 모르겠어요.\n\n기출에서 나온 적 없는 문제만 잔뜩이고\n강의에서 안중요하다고 스킵한 부분이 나오고.\n\n이 정도 난이도면 사법고시 아닌가요?\n\n다 찍고 멘탈 나갔습니다 ㅋㅋ",
    author: "타코시즈닝매콤",
    date: "2026-04-09 15:46:00",
    comments: [
      { author: "부리또한입에", content: "헝그리 모의고사 어려운건 맞는데 실전보다는 어렵게 나와요" },
      { author: "나초살사소스", content: "사법고시 ㅋㅋㅋ 공감입니다 진짜 어려웠어요" },
    ],
  },

  // --- 13. 실기/구술 준비 (보디빌딩 종목) ---
  {
    categoryId: 1,
    title: "보디빌딩 종목 실기/구술 정보 구합니다",
    content:
      "보디빌딩으로 준비 중인데\n실기 구술 정보가 너무 없어요.\n\n필기 끝나면 바로 실기 준비해야 하는데\n어떤 식으로 진행되는지 감이 안 옵니다.\n\n교본은 있다고 하는데 실제 구술 질문은\n어떤 식으로 나오나요?\n\n보디빌딩 실기 구술 보신 선배님들 조언 부탁드립니다.",
    author: "도넛슈거파우더",
    date: "2026-04-10 09:33:00",
    comments: [
      { author: "글레이즈도넛맛", content: "교본 기준으로 완벽 암기하세요 그게 제일 중요합니다" },
      { author: "올드패션도넛", content: "구술은 또박또박 답하는 연습이 중요해요" },
      { author: "크루아상초코", content: "보디빌딩이 어린 친구들 많다고 하더라구요" },
    ],
  },

  // --- 14. 심리학 용어가 어렵다 ---
  {
    categoryId: 1,
    title: "심리학 용어 왜 이렇게 어려운 거예요",
    content:
      "특성불안 상태불안 이거 진짜 헷갈려요.\n\n특성불안은 성격적 특징으로 불안을 잘 느끼는 거고\n상태불안은 환경 때문에 느끼는 일시적 불안이라는데\n\n문제에서 꼬아서 나오면 구분이 안 됩니다.\n\n3회독 했는데 이해도 안 되고\n시험 때는 더 어렵게 나올 것 같아서 걱정이에요.\n\n심리학 잘하는 방법 좀 알려주세요.",
    author: "마카롱파스텔맛",
    date: "2026-04-09 13:54:00",
    comments: [
      { author: "다쿠아즈아몬드", content: "특성은 성격 자체가 불안한 사람, 상태는 상황 때문에 불안한 거예요" },
      { author: "피낭시에버터맛", content: "기출 돌리다 보면 패턴이 보여요 처음엔 다 어려워요" },
      { author: "마들렌레몬맛", content: "용어를 축소해서 키워드만 외우는게 도움됩니다" },
    ],
  },
  {
    categoryId: 32,
    title: "심리학 23년도 기출 저만 어려운가요",
    content:
      "25년도 심리학은 노베이스로 풀어도 맞겠는데\n23년도는 진짜 어렵네요.\n\n매년 난이도가 롤러코스터인 것 같아요.\n\n22년 기출 풀다가 스트레스 받아서\n과목 자체를 바꾸려는 분도 계시더라구요.\n\n심리학 선택하신 분들 23년도 점수 어떠셨나요?",
    author: "타피오카밀크티",
    date: "2026-04-10 09:03:00",
    comments: [
      { author: "얼그레이라떼맛", content: "23년 심리학 저도 어려웠어요 24년보다 심했음" },
      { author: "말차라떼진한맛", content: "매년 난이도가 달라서 기출만으로 예측이 안돼요" },
    ],
  },

  // --- 15. 체육사 암기가 힘들다 ---
  {
    categoryId: 1,
    title: "체육사 암기 진짜 힘들어요 년도가 너무 많습니다",
    content:
      "체육사는 모르면 거의 무조건 틀리더라구요.\n\n역사니까 암기가 대부분인데\n년도 관련 문제 나오면 멘붕입니다.\n\n개화기부터 일제 광복이후 문제가 많이 나온다고 하는데\n뒤로 갈수록 사료가 없어서 나올 문제는 다 나왔다네요.\n\n역사 흐름만 암기하고 세부 년도는 포기할까 합니다.",
    author: "맥주치킨한쌍",
    date: "2026-04-09 17:57:00",
    comments: [
      { author: "양념반후라반", content: "년도는 그냥 틀리자고 생각하고 있습니다 어떻게 다 외워요" },
      { author: "닭발매운맛좋", content: "흐름만 잡고 자주 나오는 년도만 외우세요" },
      { author: "치킨무새콤한", content: "체육사 기출 위주로 보면 자주 나오는 패턴이 있어요" },
    ],
  },

  // --- 추가 주제별 게시글 ---
  {
    categoryId: 1,
    title: "학자 이름 왜 이렇게 많이 나와요",
    content:
      "학자들이 진짜 많네요 ㅋㅋ\n\n구트만 테일러 맥루한 푸코 지라르\n이름이 친근해질 정도로 많이 봤어요.\n\n난이도를 올리려니 낼 게 없으니까\n학자 이름으로 때려박는 느낌입니다.\n\n철수와 영희처럼 여기저기서 등장하네요.",
    author: "쫄면새콤한맛",
    date: "2026-04-09 14:39:00",
    comments: [
      { author: "비빔밥야채맛", content: "난이도는 올릴 수 없으니 학자로 때린다 ㅋㅋ 공감" },
      { author: "김치볶음밥맛", content: "이름이 친근해지면 합격 임박한 겁니다" },
      { author: "제육덮밥맛좋", content: "맥루한 매체이론 신문vs유튜브로 외우면 느낌 옵니다" },
    ],
  },
  {
    categoryId: 14,
    title: "사회학이 제일 어렵지 않나요",
    content:
      "저는 사회학이 제일 어려운 것 같아요.\n\n제도적 부정행위 개인적 부정행위 이런 거\n처음 보는 이론 같은데 헝그리에도 없고.\n\n과소동조 과잉동조 일탈 개념도\n보기에 섞어놓으면 진짜 헷갈리네요.\n\n교육학이 더 어렵다는 분도 있는데\n저는 사회학이 최악입니다.",
    author: "칼국수뜨끈맛",
    date: "2026-04-09 14:28:00",
    comments: [
      { author: "수제비쫄깃한", content: "사회학 교육학 둘 다 어려운데 사회학이 더 짜증나요" },
      { author: "만두국김이펑", content: "일탈 사례가 빈번하게 일어나는 걸 모르면 틀리더라구요" },
      { author: "떡국쫄깃한맛", content: "제도적 부정행위는 경기 중 반칙으로 생각하시면 돼요" },
    ],
  },
  {
    categoryId: 1,
    title: "합격 기준 정리 - 평균 60점에 과목별 40점 미만이면 과락",
    content:
      "합격 기준 헷갈리시는 분들 정리해드릴게요.\n\n5과목 각 20문항 (100점)\n전체 평균 60점 이상 + 과목별 40점 미만이면 과락입니다.\n\n즉 한 과목이라도 40점 미만이면 평균이 높아도 탈락이에요.\n\n과목당 12개 이상 맞으면 60점이니까\n8개 이상은 무조건 맞춰야 과락을 피합니다.",
    author: "오므라이스케첩",
    date: "2026-04-09 14:11:00",
    comments: [
      { author: "카레라이스맛", content: "과락 기준 정리 감사합니다 한과목 40미만이 과락이군요" },
      { author: "하이라이스맛", content: "과목당 8개는 무조건 맞춰야 한다 명심합니다" },
    ],
  },
  {
    categoryId: 26,
    title: "이론 암기 안 하고 강의만 듣는 공부법",
    content:
      "저는 암기를 안 합니다.\n\n그냥 강의를 과목당 3번씩 들으면\n알아서 머리가 저장해줍니다.\n\n암기만 하면 문제 조금만 꼬아서 내면 못 풀어요.\n이해 위주로 공부하면 응용 문제도 풀 수 있구요.\n\n시간 있으신 분들은 강의 반복 추천드립니다.\n외우는 거 싫어하시면 이 방법 한번 해보세요.",
    author: "연어초밥한점",
    date: "2026-04-09 15:43:00",
    comments: [
      { author: "참치초밥신선", content: "강의 3번 듣기 시간이 좀 걸려도 확실한 방법이네요" },
      { author: "새우초밥탱글", content: "저는 50대라 듣고 까먹고 듣고 까먹고 ㅋㅋ" },
      { author: "장어초밥고소", content: "이해 기반이 결국 오래 가죠 암기는 시험장 가면 날아감" },
    ],
  },
  {
    categoryId: 1,
    title: "기출문제 어디서 다운받나요",
    content:
      "기출문제 다운로드 어디서 하나요?\n\n네이버 카페에서 받을 수 있다고 하는데\n22년부터 25년까지 기출이 필요합니다.\n\n20년도부터 출제 유형이 달라졌다고 하니\n20년부터 풀어보는게 좋을까요?\n\n15~19년도는 안 풀어도 되려나요?",
    author: "떡갈비소스맛좋",
    date: "2026-04-09 13:25:00",
    comments: [
      { author: "불고기양념맛좋", content: "카페 가입하면 기출 다운 가능해요" },
      { author: "갈비탕뽀얀국", content: "20년부터 출제 유형 달라져서 20년부터 추천합니다" },
      { author: "소갈비구이맛", content: "15-19년은 쉬워서 참고용으로만 보세요" },
    ],
  },
  {
    categoryId: 42,
    title: "도덕적 민감성 = 감수성 맞나요?",
    content:
      "기출에서 도덕적 감수성 문제가 나왔는데\n민감성이랑 같은 뜻인가요?\n\n저는 민감 판단 동기 품성으로 외웠는데\n감수성이 민감성이라는 걸 몰라서 헷갈렸어요.\n\n선생님이 같은 뜻이라고 하셨는데\n시험에서 감수성으로 나올 수도 있으니 주의하세요.",
    author: "아이스티레몬맛",
    date: "2026-04-09 17:42:00",
    comments: [
      { author: "복숭아아이스티", content: "감지하는 건 민감이고 판단은 옳고 그름이 들어가야 해요" },
      { author: "자몽에이드상큼", content: "도덕적 민감성 감수성 같은 뜻 맞습니다" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 다가오니 불안감이 미쳤습니다",
    content:
      "점점 다가오니 불안이 오네요.\n\n공부를 오래 할 수 있는 상황이 아니라\n현재 최선을 다하는 중인데\n\n기계적으로 읽고 풀고 기억 안 나면 다음 거\n할당량 끝나면 자고 반복입니다.\n\n차라리 빨리 다음 주가 왔으면 좋겠어요.\n푹 쉬고 싶은 마음뿐입니다.",
    author: "핫초코마시멜로",
    date: "2026-04-10 08:38:00",
    comments: [
      { author: "카페라떼따듯", content: "토닥토닥 떨어지면 내년에 보면 되잖아요" },
      { author: "녹차라떼진한", content: "저도 비슷해요 압박감이 장난 아닙니다" },
      { author: "고구마라떼달콤", content: "심호흡하고 오늘 할 것만 집중하세요 화이팅" },
    ],
  },
  {
    categoryId: 38,
    title: "삼국시대 체육 무예랑 민속놀이 구분이 교재마다 달라요",
    content:
      "헝그리 26년 강의랑 에듀윌 26년 책이랑\n삼국시대 체육에서 무예와 민속놀이 구분이 다르게 되어있어요.\n\n이거 교재 오류인가요 아니면 업데이트된 건가요?\n\n교육학 모형처럼 오역 문제일 수도 있다고 하는데\n과거 공부다 보니 정확한 정보가 중요한데 헷갈립니다.\n\n어떤 게 맞는지 아시는 분 계신가요?",
    author: "닭강정양념맛",
    date: "2026-04-09 14:48:00",
    comments: [
      { author: "양념치킨한마리", content: "교재마다 다르면 기출 기준으로 외우는게 안전해요" },
      { author: "간장치킨짭잘", content: "이런 부분이 시험에 나오면 이의신청 대상이 될 수도" },
    ],
  },
  {
    categoryId: 53,
    title: "19살인데 생체 꼭 붙고 싶습니다",
    content:
      "19살인데 생활체육지도사 도전합니다.\n\n공부를 하면 할수록 더 헷갈리고 어렵네요.\n\n주변에서는 어린 나이에 대단하다고 하시는데\n실력이 안 따라가니 걱정입니다.\n\n10명 중 4명만 붙고 6명은 떨어지는 시험이라니\n더 긴장됩니다.\n\n같이 준비하시는 분들 모두 화이팅!",
    author: "팝콘캐러멜맛좋",
    date: "2026-04-10 09:08:00",
    comments: [
      { author: "나쵸치즈듬뿍", content: "19살에 도전하는 거 멋져요 꼭 붙으세요" },
      { author: "프레첼머스타드", content: "32살인데 저도 꼭 붙었으면 좋겠어요 같이 화이팅" },
      { author: "팝콘버터듬뿍", content: "어리니까 머리가 잘 돌아가잖아요 부러워요" },
    ],
  },
  {
    categoryId: 1,
    title: "체육사 기출 위주로 보시나요 이론 위주로 보시나요",
    content:
      "체육사 공부법이 고민입니다.\n\n기출 위주로 보면 자주 나오는 패턴은 잡히는데\n새로운 문제가 나오면 속수무책이고.\n\n이론을 다 외우려니 양이 장난 아니에요.\n\n사료가 없어서 나올 문제는 다 나왔다고 하면\n기출 위주가 맞을 것 같은데\n\n혹시 다른 공부법 있으신 분 계신가요?",
    author: "크림스프부드러",
    date: "2026-04-09 21:04:00",
    comments: [
      { author: "양송이스프맛좋", content: "기출 패턴 잡고 이론으로 보충하는 게 효율적이에요" },
      { author: "미네스트로네맛", content: "체육사는 흐름 잡고 반복하면 됩니다" },
      { author: "감자스프포근맛", content: "모르면 거의 무조건 틀리는 과목이라 암기가 필수" },
    ],
  },
  {
    categoryId: 12,
    title: "스포츠윤리 서양사상 파트 암기하시나요?",
    content:
      "스포츠윤리에서 서양사상 파트가 있는데\n이거 암기해야 하나요?\n\n기출에서는 서양사상이 거의 안 나왔는데\n사설 모의고사에서는 서양사상만 나오더라구요.\n\n기출 기준으로 안 나온 부분은 넘기려고 했는데\n혹시 올해 나올까 봐 불안합니다.\n\n다들 서양사상 외우시나요?",
    author: "브라우니초코맛",
    date: "2026-04-09 21:26:00",
    comments: [
      { author: "쿠키반죽맛좋", content: "기출 안 나온 건 과감히 넘기세요 시간이 없어요" },
      { author: "머핀블루베리맛", content: "서양사상 올해 나오면 다 찍는 겁니다 ㅋㅋ" },
    ],
  },
  {
    categoryId: 19,
    title: "현재 최선을 다하고 떨어지면 내년에 안 봅니다",
    content:
      "최선을 다하고 있기에 올해 떨어지면\n내년에 안 봅니다 ㅋㅋ 앞으로도 ㅋㅋ\n\n그냥 머리가 안 되는 걸로 하려구요.\n\n근데 이런 마음으로 하니까 오히려 편해요.\n부담 없이 할 수 있는 만큼만 하자는 마인드.\n\n다들 너무 스트레스 받지 마세요.\n이거 하나가 인생 전부는 아니잖아요.",
    author: "맥주거품시원한",
    date: "2026-04-10 08:55:00",
    comments: [
      { author: "하이볼상쾌한", content: "오히려 이런 마인드가 시험장에서 멘탈 잡아주죠" },
      { author: "소주한잔깔끔", content: "맞아요 너무 압박감 주지 마세요 건강이 먼저" },
      { author: "막걸리한사발", content: "저도 같은 마인드예요 최선 다했으니 후회 없음" },
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
