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
  // ===== 4차 시드: 생체/장체/노인/유소년 카톡방 추출 (2026-04-14 ~ 2026-04-18) =====

  // --- 과목 선택/공부법 ---
  {
    categoryId: 1,
    title: "윤리 vs 심리 고민하다가 결국 윤리 선택했습니다",
    content:
      "남은 과목 하나를 윤리로 할지 심리로 할지 진짜 고민 많이 했어요.\n\n주변에서는 사회학이랑 윤리가 상대적으로 쉽다고 하는데\n\n저는 윤리 쪽이 좀 더 와닿더라구요.\n\n심리학은 처음 보는 이론이랑 학자 이름 외울게 너무 많아서\n\n윤리학보다 오히려 더 어렵게 느껴졌습니다.\n\n비전공자 분들은 윤리 추천드려요.",
    author: "떡볶이마스터",
    date: "2026-04-14 16:25:00",
    comments: [
      { author: "초코파이킹", content: "저도 윤리 선택했어요 심리학은 학자이름이 미쳤음" },
      { author: "라면장인", content: "본인이 강한거 하는게 맞죠 저는 심리 갔는데 후회중" },
      { author: "수박이좋아", content: "사회학이랑 윤리가 확실히 점수 뽑기 쉬운 듯" },
    ],
  },
  {
    categoryId: 1,
    title: "기출문제 사이트 써본 후기 공유합니다",
    content:
      "카톡방에서 추천받은 기출문제 사이트 써봤는데 괜찮더라구요.\n\n장점은 가격이 저렴하고 기출문제 정답 해설이 바로 나와서 시간이 단축됩니다.\n\n오답노트 기능도 있어서 틀린거 다시 볼 수 있고요.\n\n무료로 하루 10문제 풀 수 있고 광고 보면 추가 5문제 가능합니다.\n\n유료는 9900원인데 기간제인지 무조건인지는 확인해봐야 해요.",
    author: "방울토마토",
    date: "2026-04-14 15:30:00",
    comments: [
      { author: "감자튀김맛", content: "오 해설 바로 나오는거 좋네요 저도 써봐야겠다" },
      { author: "딸기우유맛", content: "무료로도 충분한가요?" },
      { author: "치즈돈까스", content: "9900원이면 괜찮네요 한달이면 남는장사" },
    ],
  },
  {
    categoryId: 10,
    title: "특수체육론 자료가 너무 없어요 어떻게 공부하셨나요",
    content:
      "특수체육론 공부하려는데 자료가 진짜 부족합니다.\n\n한그리로 공부하다가 이만한 책 없어서 그냥 안데르로 공부 중인데\n\n기출이 아닌 건 이해하기가 너무 힘드네요.\n\n혹시 특수체육론 기출 답안지 있으신 분 계신가요?\n\n선배님들 조언 부탁드립니다.",
    author: "피자한판더",
    date: "2026-04-14 20:58:00",
    comments: [
      { author: "바나나쉐이크", content: "기출 답안지 공유해드립니다 카페에 올려놨어요" },
      { author: "콜라한잔만", content: "특수체육론 기출문제가 매번 새로운 느낌이라 힘들죠" },
    ],
  },
  {
    categoryId: 1,
    title: "안데르 교재로 고득점 합격한 사람 있나요",
    content:
      "안데르 교재 달달 외워서 인증 시험 봤는데 고득점 합격했습니다.\n\n주변에서는 다 안데르로 합격했어요.\n\n시험 끝나고 보면 교재가 중요한게 아니라 본인이 부족한거지 교재 탓은 아니더라구요.\n\n모의고사 치고 안데르 교재의 기출문제 분석으로도 충분합니다.\n\n안데르 26년 교재 추천합니다.",
    author: "햄버거세트",
    date: "2026-04-15 11:46:00",
    comments: [
      { author: "우동한그릇", content: "안데르 세세하게 공부하기에 좋은 교재 맞아요" },
      { author: "짬뽕대왕", content: "교재보다 본인 공부량이 중요하다는거 공감" },
      { author: "탕수육마니아", content: "저도 안데르로 합격했어요 기출 반복이 답입니다" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 IM 45초인데 실기 가능성 있나요",
    content:
      "필기 끝나면 바로 실기 준비해야 하는데\n\n현재 IM이 45초 정도 나옵니다.\n\n혼자 벽시계 보고 벽축 바로 달렸는데 40초대라 막막하네요.\n\n제주도는 실기장도 없어서 특강을 들을지 그냥 혼자 준비할지 고민입니다.\n\n선배님들 조언 부탁드립니다.",
    author: "카스테라빵",
    date: "2026-04-14 21:57:00",
    comments: [
      { author: "마카롱세트", content: "다이빙 횟수랑 스트로크 횟수 정해놓고 배영 중심으로 잡으면 30초 충반 가능합니다" },
      { author: "와플좋아해", content: "잠재력이 좋으면 빡세게 해보는거죠 포기하지 마세요" },
      { author: "크루아상맛", content: "45초면 한달이면 5초 줄일 수 있어요 화이팅" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 25m풀이랑 50m풀 차이 장난 아니네요",
    content:
      "실기 전에 시험장 가보고 싶었는데 못 가서\n\n창원 스포츠실에서 25m풀로 연습하고 있었거든요.\n\n근데 실제 시험은 50m풀이라 레인도 달라서 더 긴장될 것 같아요.\n\n턴 연습도 25m풀이랑 완전 다르더라구요.\n\n혹시 50m풀 경험 있으신 분 팁 부탁드립니다.",
    author: "젤리곰인형",
    date: "2026-04-14 22:08:00",
    comments: [
      { author: "푸딩좋아", content: "50m풀은 턴이 한번 줄어드니까 오히려 유리할 수도 있어요" },
      { author: "도넛구멍", content: "처음 가보는 수영장이면 더 긴장되죠 미리 가보는게 좋아요" },
    ],
  },
  {
    categoryId: 1,
    title: "기출 3~4번 반복했더니 답이 외워져버렸는데",
    content:
      "기출을 3~4번씩 반복했더니 문제 보면 답이 바로 떠올라요.\n\n실력인지 외운건지 구분이 안 됩니다.\n\n새로운 모의고사를 풀어야 할 것 같은데\n\n시간이 없어서 기출만 계속 돌리고 있거든요.\n\n기출 답 체크 안 하고 틀린 것만 확인하는 게 효과적이라고 하던데\n\n다들 어떻게 하셨나요?",
    author: "귤껍질향기",
    date: "2026-04-15 10:32:00",
    comments: [
      { author: "사과잼바른", content: "지금은 시간이 짧으니 기출 + 해설 위주 강의가 나을 겁니다" },
      { author: "블루베리잼", content: "답을 체크하지 말고 점수만 보세요 답 외우면 실력이 아닙니다" },
      { author: "망고스무디", content: "모의고사 풀어보세요 새로운 문제 나오면 체감 확 달라져요" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 전날 준비물 정리해봤습니다 참고하세요",
    content:
      "내일 시험이라 준비물 정리해봅니다.\n\n1. 컴퓨터용 사인펜 (필수)\n2. 수험표 (인쇄)\n3. 신분증\n4. 연필 + 지우개\n5. 아날로그 손목시계 (저장기능 없는 것만 가능)\n\n스마트워치 착용 금지이고 핸드폰은 무조건 꺼야 합니다.\n\n수험표는 체육지도자 홈페이지에서 출력하면 됩니다.\n\n다들 내일 화이팅!",
    author: "초밥열두개",
    date: "2026-04-17 23:31:00",
    comments: [
      { author: "김밥천국갈", content: "사인펜 여분으로 챙기세요 중간에 안 나오면 멘붕" },
      { author: "떡국맛있다", content: "시계는 교실에 보통 있긴 한데 혹시 모르니 가져가세요" },
      { author: "순두부찌개", content: "핸드폰 울리면 퇴장이라 확실히 끄고 가방에 넣으세요" },
      { author: "비빔밥세트", content: "수험표 첫 장만 필요합니다 나머지는 안 가져가도 돼요" },
    ],
  },
  {
    categoryId: 1,
    title: "모의고사 평균 70~80 나오는데 합격 가능할까요",
    content:
      "기출 트는 만큼 모의고사 1회 돌려봤는데\n\n평균이 70~80 사이로 나옵니다.\n\n잘 나오는 과목은 70-80까지 나오는데\n\n잘 안 나오는 과목들이 60 미만 나와서 불합격입니다.\n\n모의고사 기준으로 80점 이상이면 안심권이라고 하던데\n\n70점대면 어떨까요?",
    author: "호두과자맛",
    date: "2026-04-14 21:47:00",
    comments: [
      { author: "붕어빵슈크림", content: "70이면 합격권이긴 한데 과락만 조심하세요" },
      { author: "에그타르트", content: "90이면 안심권이고 80이면 합격 가능성 높습니다" },
    ],
  },
  {
    categoryId: 3,
    title: "교육학이랑 체육사 도대체 어떻게 공부하나요",
    content:
      "교육학이랑 체육사는 아무리 해도 머리에 안 들어옵니다.\n\n외국인 이름이 왜 이렇게 많은건지\n\n철학자인지 교육학자인지 듣는 보르 못해\n\n교육모형도 내려봐도 모르겠고.\n\n혹시 암기법이나 정리 자료 추천해주실 수 있나요?",
    author: "아이스크림콘",
    date: "2026-04-15 11:57:00",
    comments: [
      { author: "캐러멜팝콘", content: "기출 풀면서 해설 강의 듣는게 제일 효율적이에요" },
      { author: "솜사탕핑크", content: "교육학은 모형 이름 외우는게 핵심입니다 나머지는 기출로" },
      { author: "마시멜로우", content: "체육사는 연도랑 인물만 잡으면 됩니다 스토리로 외우세요" },
    ],
  },
  {
    categoryId: 1,
    title: "역학 vs 심리학 선택 고민 중입니다",
    content:
      "체육과 나왔는데 윤리학 심리학 중에 고민하다가\n\n역학이랑 심리학으로 좁혀졌습니다.\n\n역학은 계산 문제가 좀 있는데 빡세게 공부하면 점수가 잘 나오고\n\n심리학은 이론 위주라 외울게 많지만 이해하면 안정적이에요.\n\n다들 어떤 과목 선택하셨나요?",
    author: "팥빙수한그릇",
    date: "2026-04-16 16:53:00",
    comments: [
      { author: "냉면한그릇", content: "체육과 나오셨으면 윤리 심리 사회학 추천드려요 역학은 비전공자한테 어려움" },
      { author: "칼국수장인", content: "심리학 선택했는데 역학보다 쉬운 건 아닙니다 둘 다 빡셈" },
      { author: "수제비맛집", content: "저는 역학 선택했는데 계산 문제만 잘 잡으면 고득점 가능해요" },
    ],
  },
  {
    categoryId: 1,
    title: "과락 기준이 40점 미만이죠? 40점은 안전한거 맞나요",
    content:
      "5과목 중 1과목이라도 40점 나오면 필기 탈락인가요?\n\n아니면 40점 미만으로 보는 건가요?\n\n40점 딱 맞으면 괜찮은 건지 확인하고 싶습니다.",
    author: "쿠키앤크림",
    date: "2026-04-15 15:27:00",
    comments: [
      { author: "민트초코파", content: "40점 미만이 탈락이에요 40점까지는 SAFE" },
      { author: "바닐라라떼", content: "과락만 안 걸리면 평균 60 넘기면 합격입니다" },
    ],
  },

  // --- 수영/실기 관련 ---
  {
    categoryId: 5,
    title: "배영할 때 무호흡으로 얼마나 가시나요",
    content:
      "IM에서 배영 구간 무호흡으로 밀어야 기록이 나온다는데\n\n저는 4스트로크 1호흡 정도 하고 있거든요.\n\n선배님은 86초까지 하신다는데 저는 아직 멀었어요.\n\n배영에서 호흡 조절 팁 있으면 공유 부탁드립니다.",
    author: "오렌지주스잔",
    date: "2026-04-14 22:10:00",
    comments: [
      { author: "포도주스맛", content: "저는 5~6 무호흡으로 가는데 체력이 관건이에요" },
      { author: "레몬에이드", content: "87초에 안심하지 말고 무호흡 위주로 밀어보세요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 실기 89.59초로 겨우 합격한 후기",
    content:
      "85초까지 만들고 실기 갔는데 시험장에서 89.59초 나왔습니다.\n\n처음 가본 수영장이라 너무 긴장했고\n\n배영턴할 때 기억이 사라져서 거의 멘붕이었어요.\n\n감성을 이성으로 먹이고 죽이라 하면서 버텼습니다.\n\n레인도 길고 처음 본 곳이라 더 답답했는데\n\n합격이라 다행입니다.",
    author: "체리콕한잔",
    date: "2026-04-14 22:06:00",
    comments: [
      { author: "키위주스맛", content: "89초 아슬아슬 ㅋㅋ 근데 합격이면 된거죠 축하드려요" },
      { author: "자몽에이드", content: "실기장 긴장감은 연습과 차원이 다르죠 고생하셨습니다" },
      { author: "복숭아맛", content: "감성을 이성으로 먹이라니 명언이네요" },
    ],
  },
  {
    categoryId: 5,
    title: "배영에서 반사로턴 연습법 공유합니다",
    content:
      "배영 안 되는 분들 반사로턴 위주로 많이 연습하시는게 방법입니다.\n\n벽면에서 턴하고 스트리밍 벽받기를 확실히 하고\n\n기다리세요 점점 1초 2초 기다리면 그때 할 최소한 5m 나가고\n\n반사로턴으로 가세요.\n\n괜히 스타트 빨리 하지 마시고 벽 받고 항상 1초~2초 기다린다 생각하세요.",
    author: "수박바좋아",
    date: "2026-04-16 08:33:00",
    comments: [
      { author: "메로나한입", content: "반사로턴 연습만 많이 하시면 되이쥬 좋은 팁 감사합니다" },
      { author: "하드바사줘", content: "벽받기 확실히 하는게 핵심이군요 내일부터 해볼게요" },
      { author: "쭈쭈바냠냠", content: "한달이면 5초 가능합니다 화이팅" },
    ],
  },
  {
    categoryId: 5,
    title: "실기 수영 영상 올리면 피드백 해주실 분 계신가요",
    content:
      "이 방에서 IM 영상 올리면 고수님들이 피드백 해주신다고 해서요.\n\n부끄럽지만 올려보려고 합니다.\n\n솔직히 물고기같다는 소리 듣고 싶은데\n\n아직 물 위의 사람 수준도 안 되는 것 같아요.\n\n용기를 내서 올려보겠습니다.",
    author: "팝콘버터맛",
    date: "2026-04-16 09:33:00",
    comments: [
      { author: "나초치즈맛", content: "올리면 바로 친해집니다 진짜로 다들 격려만 해줘요" },
      { author: "감자칩오리", content: "공개할수록 실력이 늘어요 용기내세요" },
      { author: "프레첼소금", content: "얼굴은 모르니까 괜찮습니다 ㅋㅋ" },
    ],
  },

  // --- 시험 당일/후기 ---
  {
    categoryId: 1,
    title: "2026 필기 역대급 난이도 확정인 듯",
    content:
      "오늘 시험 보고 왔는데 진짜 미쳤습니다.\n\n기출로만 공부한 사람들은 전멸일 거 같아요.\n\n처음 보는 내용이 너무 많이 나왔고\n\n보기도 다 비슷비슷하게 꼬아놔서 헷갈림.\n\n성적 나올 때까지 기다려야 하는 이 시간이 제일 괴로움.\n\n다들 고생하셨습니다.",
    author: "핫도그겨자",
    date: "2026-04-18 11:48:00",
    comments: [
      { author: "소세지야채", content: "교육학이 진짜 미쳤어요 처음 보는 내용 투성이" },
      { author: "베이컨구이", content: "체육사가 제일 어려웠음 이번 거 뭔가요 진짜" },
      { author: "스팸김밥", content: "복수정답 기대하고 있습니다 이의신청 꼭 하세요" },
      { author: "햄치즈토스", content: "25년이 쉬웠으니 올해 각오했는데 이 정도일 줄은" },
    ],
  },
  {
    categoryId: 1,
    title: "체육사 과목 진짜 뭔가요 이번에",
    content:
      "체육사가 제일 자신 있었는데 이번 시험에서 완전 박살났습니다.\n\n기출에서 본 적 없는 문제가 절반 이상이었어요.\n\n비하인드 스토리까지 알아야 하는 건지\n\n세부의 세부를 묻는 느낌이었음.\n\n안데르 교재 꼼꼼히 봤는데도 처음 보는 내용이 많았어요.\n\n내년에는 꼭 붙어야겠다...",
    author: "치킨무양념",
    date: "2026-04-18 11:52:00",
    comments: [
      { author: "양파링맛", content: "체육사 믿었는데 저도 완전 박살 ㅋㅋ" },
      { author: "어니언링링", content: "기출로만 공부한 사람 전멸일듯 진짜" },
      { author: "마늘빵향기", content: "안데르로도 부족한 시험이 있다니 충격" },
    ],
  },
  {
    categoryId: 1,
    title: "장체 특수체육론 20분 시간이 진짜 부족하네요",
    content:
      "장체 특별과정으로 특수체육론 1과목만 보는데\n\n20분 안에 문제 풀고 답안지 마킹까지 해야 합니다.\n\n좀 빠듯하긴 한데 마킹 실수하면 진짜 시간에 쫓기니까 주의하세요.\n\n문제는 문제지에 마킹은 정확하게 동그라미를 빈틈없이 꽉 채워서\n\n한과목 풀고 바로 마킹하는 스타일 추천드립니다.",
    author: "샌드위치빵",
    date: "2026-04-17 16:22:00",
    comments: [
      { author: "크로와상맛", content: "저도 바로 마킹 스타일이에요 검토할 때 다시 확인하구요" },
      { author: "바게트빵향", content: "마지막 5분은 무조건 검토 시간으로 잡아야 합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "복수정답 나와라 제발 이의신청 하세요 다들",
    content:
      "장체 시험 보고 왔는데 복수정답 나올 것 같은 문제가 꽤 있어요.\n\n특히 특수체육론 20번 문제 답이 1번인지 4번인지 의견이 갈리고\n\n13번 장애인 스포츠 종목 규칙 문제도 보기가 애매합니다.\n\n이의신청 기간이 3일이니까 꼭 해보세요.\n\n복수정답 인정되면 다 정답처리 됩니다.",
    author: "컵케이크딸기",
    date: "2026-04-18 10:48:00",
    comments: [
      { author: "머핀블루베리", content: "20번 4번인줄 알았는데 1번이라는 말도 있고 헷갈리네요" },
      { author: "스콘잼바른", content: "이의신청 먹히면 대박인데 기대해봅시다" },
      { author: "브라우니초코", content: "13번 보치아가 답 같은데 축구도 맞는거 같고 미치겠음" },
    ],
  },
  {
    categoryId: 1,
    title: "시험장 주차 진짜 전쟁입니다 일찍 가세요",
    content:
      "시험장 주차가 제일 힘들었어요.\n\n학교 내 주차장은 대부분 차단되어 있고\n\n근처 골목이나 공영주차장에 세워야 합니다.\n\n멀리 주차하고 뛰어왔더니 땀 뻘뻘이고\n\n일찍 가서 근처 주차장이나 골목 주차 하시고 산책하다 들어가시는 게 좋아요.",
    author: "타코야끼맛",
    date: "2026-04-18 08:08:00",
    comments: [
      { author: "오코노미야끼", content: "학교도 보통 다 열어주긴 하는데 차단만 걸거든 빈 자리 있으면 세워도 됩니다" },
      { author: "라멘한그릇", content: "저는 대중교통으로 갔어요 주차 스트레스 없어서 좋았음" },
    ],
  },
  {
    categoryId: 1,
    title: "OMR 사인펜 빨간색으로 하면 안 되는거죠?",
    content:
      "OMR카드 사인펜 체킹을 빨간색으로 하면 안 되는거죠?\n\n국민체육진흥공단에 전화했더니 안 된다고 하네요.\n\n수험 안내에 컴퓨터용 사인펜이라고 되어있는데\n\n혹시 볼펜이나 다른 걸로 하신 분 계신가요?",
    author: "에클레어크림",
    date: "2026-04-15 17:15:00",
    comments: [
      { author: "슈크림빵맛", content: "검은색 컴퓨터용 사인펜만 됩니다 수정 테이프도 챙기세요" },
      { author: "크림치즈맛", content: "시간 충분하니 마킹까지 하실 수 있으세요 걱정 마세요" },
    ],
  },
  {
    categoryId: 7,
    title: "벼락치기로 합격한 사람 있나요 솔직히",
    content:
      "공부 거의 못하고 처음 치러가는데\n\n360점이면 내일 합격 가능하겠죠?\n\n과목 다르게 넣어서 시험 쳤는데 360점 나왔어요.\n\n체육사 25년도 기출이 좀 쉽다고 하던데\n\n벼락치기로 붙으신 분 있나요?",
    author: "초코칩쿠키",
    date: "2026-04-17 13:51:00",
    comments: [
      { author: "버터쿠키맛", content: "합격입니다 축하해요 ㅋㅋ" },
      { author: "오레오맛좋아", content: "360이면 충분하지 않나요 과락만 안 걸리면" },
      { author: "다이제스티브", content: "시험장 분위기 느끼는것도 경험이에요 화이팅" },
    ],
  },
  {
    categoryId: 2,
    title: "심리학 과목 진짜 극악입니다 23년도 45점 나옴",
    content:
      "23년도 심리학 기출 풀어봤는데 45점 나왔습니다.\n\n극악의 난이도였어요.\n\n매년 심리학이 이런 건 아닌데 23 24년도가 특히 어려웠다고 하네요.\n\n정답 : 매년 다름.\n\n본인 심리도 모르는데 남의 심리를 어떻게 공부하나요.\n\n심리학 공부법 좀 알려주세요.",
    author: "타르트레몬",
    date: "2026-04-15 15:33:00",
    comments: [
      { author: "파이애플맛", content: "심리학이 원래 어렵습니다 학자 이름이 외계어 급임" },
      { author: "체리파이맛", content: "기출 반복하면서 이론 잡으면 60은 나와요" },
    ],
  },
  {
    categoryId: 4,
    title: "시험 전날 긴장 풀기 꿀팁",
    content:
      "내일 시험인데 긴장돼서 잠이 안 옵니다.\n\n저만의 긴장 푸는 방법 공유합니다.\n\n4초 들이쉬고 4초 참기 6초 내뱉기 2회 반복하면 긴장 풀립니다.\n\n그리고 달달한 거 먹으면 뇌에 당 보충돼서 좋아요.\n\n내일 아침에 초콜릿이나 바나나 챙겨가세요.\n\n다들 내일 화이팅!",
    author: "꿀떡한입에",
    date: "2026-04-17 11:03:00",
    comments: [
      { author: "인절미찹쌀", content: "호흡법 좋네요 바로 해볼게요 감사합니다" },
      { author: "경단팥소맛", content: "저는 커피 한 잔이 제일 나아요 내일도 마시고 갑니다" },
      { author: "약과꿀맛나", content: "3일만 기억하면 됩니다 화이팅!" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 끝나고 카톡방 실시간 후기가 대박이네요",
    content:
      "시험 끝나고 카톡방에서 실시간으로 난이도 얘기하는데\n\n다들 역대급 어렵다고 하고 있어요.\n\n특수체육론도 장체도 생체도 다 어렵다는 반응.\n\n기출로만 공부한 분들은 전멸이라고 하네요.\n\n채팅창이 미친듯이 올라갑니다.\n\n그래도 여기서 같이 고민하고 공부한 게 위안이 됩니다.",
    author: "붕어빵팥맛",
    date: "2026-04-18 11:55:00",
    comments: [
      { author: "국화빵크림", content: "진짜 역대급이었어요 다들 고생하셨습니다" },
      { author: "잉어빵슈크림", content: "복수정답 기대하고 기다려봅시다" },
      { author: "풀빵초코맛", content: "이 방이 있어서 행복했다 진심으로" },
    ],
  },
  {
    categoryId: 6,
    title: "수험표 출력 방법 정리합니다",
    content:
      "수험표 출력은 체육지도자 홈페이지에서 하시면 됩니다.\n\n접수 및 결제 → 수험표 출력 메뉴로 가시면 돼요.\n\n사진 나온 첫 장만 있으면 됩니다.\n\n나머지 유의사항 페이지는 안 가져가도 괜찮아요.\n\n종이로 인쇄해서 가시면 됩니다.",
    author: "골프채한자루",
    date: "2026-04-17 16:43:00",
    comments: [
      { author: "퍼팅연습중", content: "프린터가 없어서 편의점 가야겠네요 감사합니다" },
      { author: "드라이버샷", content: "흑백인쇄 해도 되나요?" },
    ],
  },
  {
    categoryId: 8,
    title: "필기 합격하고 구술은 내년에 봐도 되나요",
    content:
      "필기 합격하면 구술이나 실기는 나중에 내도 되는지 궁금합니다.\n\n올해 필기 합격하면 27년까지 유효하다고 하네요.\n\n실기는 가능하면 꼭 보세요.\n\n떨어지더라도 어떻게 하는지 경험을 해본게 차이가 매우 크다고 합니다.",
    author: "배드민턴콕",
    date: "2026-04-14 22:29:00",
    comments: [
      { author: "셔틀콕날린", content: "2년 유효니까 내년까지 실기 한번 더 가능합니다" },
      { author: "스매시치고", content: "경험 차이가 큽니다 무조건 한번 보시길 추천" },
    ],
  },
  {
    categoryId: 1,
    title: "24년도 기출 진짜 역대급이더라구요",
    content:
      "24년도 기출 풀어봤는데 25년도보다 훨씬 어렵습니다.\n\n교육학이 특히 55점 나오고 23년도는 70점 나왔거든요.\n\n심리학도 24년 65점 23년 95점으로 차이가 심합니다.\n\n난이도 조절을 매년 하는 것 같은데\n\n올해도 각오 단단히 해야 할 것 같아요.",
    author: "알밤줍기대",
    date: "2026-04-17 00:15:00",
    comments: [
      { author: "도토리묵맛", content: "24년 극악이었고 25년 쉬웠으니 26년이 걱정됩니다" },
      { author: "밤고구마맛", content: "심리학 95에서 65 차이 ㄷㄷ 과목마다 편차가 심하네요" },
      { author: "호두파이한", content: "기출 많이 풀어도 매년 새로운 문제가 나와서 어렵죠" },
    ],
  },
  {
    categoryId: 9,
    title: "장체 시험 결과 망한 것 같은데 위로 좀",
    content:
      "장체 특수체육론 너무 어려웠어요.\n\n기출 2015~2025까지 다 풀어봤지만 올해 시험이랑 하나도 비슷하지 않았습니다.\n\n장애인 스포츠 종목 규칙이 세부적으로 나오고\n\n처음 보는 내용이 절반은 넘었어요.\n\n한 문제 차이로 떨어질 것 같아서 이의신청 해봐야겠어요.",
    author: "야구글러브새",
    date: "2026-04-18 10:40:00",
    comments: [
      { author: "배트스윙맛", content: "저도 장체 망했어요 복수정답 기대하고 있습니다" },
      { author: "포수마스크", content: "이의신청 기간 3일이니까 꼭 하세요 먹히면 다 정답처리" },
    ],
  },
  {
    categoryId: 1,
    title: "해커스 모의고사 써본 후기",
    content:
      "해커스 모의고사 1차부터 3차까지 있는데 난이도가 다 다릅니다.\n\n3차는 370 나왔는데 1차는 300점도 못 나왔어요.\n\n기존 기출보다 어렵게 나오는 문제들이 많아서\n\n실전 감각 잡기에 좋은 것 같아요.\n\n시간도 100분 타이머 딱 맞춰서 보여줍니다.",
    author: "모닝커피향",
    date: "2026-04-16 22:57:00",
    comments: [
      { author: "아메리카노", content: "1차가 어렵고 3차가 쉬운 편이라 그런거예요" },
      { author: "라떼한잔만", content: "타이머 기능 좋네요 실전감 키우기 딱이다" },
      { author: "에스프레소", content: "안데르 기출이랑 병행하면 효과 좋습니다" },
    ],
  },
  {
    categoryId: 51,
    title: "AI한테 공부 질문하면 거짓말 주의하세요",
    content:
      "챗GPT한테 기출 문제 물어봤는데 답이 맞다 틀리다 계속 바뀝니다.\n\n같은 질문을 꼬아서 하면 계속 이러다 저러다 합니다.\n\n특히 보기 중에 답을 마지막에 말하는 경우가 있어서\n\n내가 더 알아야 해요.\n\nAI 맹신하지 마시고 교재랑 교차 검증 꼭 하세요.",
    author: "녹차라떼맛",
    date: "2026-04-15 16:15:00",
    comments: [
      { author: "말차빙수맛", content: "챗GPT는 거짓을 없이 말하는 아이라고 생각하면 됩니다" },
      { author: "호지차라떼", content: "네이버 검색이 더 나은 수준이에요 맹신 금지" },
      { author: "보이차한잔", content: "한그리 해설이 더 정확하다고 봅니다" },
    ],
  },
  {
    categoryId: 1,
    title: "생체 시험 봤는데 역대급 어렵다는 반응입니다",
    content:
      "생체 시험 끝나고 교실 나오자마자 다들 어렵다고 했습니다.\n\n책에 없는 내용이 별로 없었다는데\n\n저는 처음 보는 게 더 많았어요.\n\n기출이랑 보기가 이쪽저쪽 바뀌어 있어서 순간 헷갈렸고\n\n교육학 사회학이 특히 까다로웠어요.\n\n감점제 나오면 좋겠는데 현실적으로 어렵겠죠.",
    author: "생크림케이크",
    date: "2026-04-18 11:48:00",
    comments: [
      { author: "레드벨벳맛", content: "교육학이 진짜 미쳤습니다 모형 이름이 다 새거" },
      { author: "티라미수맛", content: "복수정답이라도 나오면 감사하겠다" },
      { author: "치즈케이크", content: "25년이 쉬웠으니 올해 더 어렵게 낸 듯" },
    ],
  },
  {
    categoryId: 52,
    title: "시험장에 시계 있나요? 개인 시계 가져가야 하나요",
    content:
      "필기 시험장에 시계가 있는지 궁금합니다.\n\n중고등학교 교실에서 시험보는 거라 거의 교실에 시계 있을 거예요.\n\n시간이 부족하지는 않을 겁니다.\n\n시간이 부족하다 = 공부 안 했다 이니까요.\n\n빨리 나가고 싶다는 생각만 맴돕니다.",
    author: "운동화끈묶",
    date: "2026-04-16 16:17:00",
    comments: [
      { author: "조깅화러닝", content: "교실에 시계 있고 남은 시간 계속 안내해주세요" },
      { author: "마라톤완주", content: "시간 걱정은 안 하셔도 됩니다 여유 있어요" },
    ],
  },
  {
    categoryId: 1,
    title: "공인중개사 합격하고 스포츠지도사 도전 중입니다",
    content:
      "공인중개사 29회 합격자입니다.\n\n그때 백수였는데 합격한 경험이 있어서\n\n이번 스포츠지도사도 도전하게 됐어요.\n\n물론 쉬운 시험은 아닌데 포기하지 않으면 됩니다.\n\n1년에 한번이라 부담감이 장난 아니네요.",
    author: "당근케이크맛",
    date: "2026-04-14 16:29:00",
    comments: [
      { author: "호박파이맛", content: "공인중개사 합격하셨으면 이것도 충분히 하실 수 있어요" },
      { author: "감자그라탕", content: "멘탈이 중요합니다 포기만 안 하면 됩니다" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 보고 나서 가채점이 무서워요",
    content:
      "시험 끝나고 가채점하는 시간이 진짜 무섭습니다.\n\n문제지 가지고 나올 수 있어서 답 맞춰보는데\n\n분명 아는 걸 체크했는데 틀린 게 보이면 멘탈이 나가요.\n\n가채점은 오후 3~4시에 여기저기서 올라옵니다.\n\n다들 멘탈 관리 잘하세요.",
    author: "크레페딸기잼",
    date: "2026-04-18 10:29:00",
    comments: [
      { author: "와플시럽맛", content: "가채점 안 보는게 정신건강에 좋습니다 ㅋㅋ" },
      { author: "팬케이크맛", content: "공식 가답안은 체지도사 사이트에 올라옵니다 3~4시쯤" },
    ],
  },
  {
    categoryId: 3,
    title: "교육모형 키워드 정리 공유합니다",
    content:
      "교육모형 관련해서 자주 나오는 키워드 정리해봤어요.\n\n학교스포츠클럽 : 방과후 동아리\n\n스포츠클럽활동 : 창체\n\n이 차이를 잘 구분해야 합니다.\n\n학교스포츠클럽은 교육과정 외 활동이고\n\n스포츠클럽활동은 정규수업시간에 해당돼요.\n\n기출에 매번 나오는 부분이니 꼭 체크하세요.",
    author: "요거트스무디",
    date: "2026-04-17 20:56:00",
    comments: [
      { author: "그래놀라맛", content: "이거 진짜 헷갈렸는데 깔끔하네요 감사합니다" },
      { author: "아사이볼맛", content: "시험에 꼭 나오는 부분이죠 메모해놓겠습니다" },
      { author: "오트밀한숟", content: "스포츠 관련 창체는 정규수업시간 맞아요" },
    ],
  },
  {
    categoryId: 10,
    title: "장체 시험 장애 유형별 문제가 너무 세부적",
    content:
      "올해 장체 시험은 기존 기출이 큰 틀에서 물었다면\n\n이번에는 세부에서 세부를 묻는 느낌이었어요.\n\n장애인 스포츠 종목의 경기 규칙도 상세하게 나오고\n\n처음 보는 분류 기준도 있었습니다.\n\n특히 보치아 BC3 등급이랑 골볼 규칙 관련 문제가 어려웠어요.\n\n다들 고생하셨습니다.",
    author: "두부김치맛",
    date: "2026-04-18 10:37:00",
    comments: [
      { author: "청국장맛좋", content: "장체 난이도가 해마다 올라가는 것 같아요" },
      { author: "된장찌개맛", content: "경기규칙 세부까지 외워야 하는건 좀 심한듯" },
      { author: "미역국한그", content: "복수정답 기대하고 이의신청 합시다" },
    ],
  },
  {
    categoryId: 1,
    title: "노인 구술 정보가 너무 없어요 도와주세요",
    content:
      "노인 구술 시작해야 하는데 정보가 너무 없습니다.\n\n필기 끝나면 구술 준비해야 하는데\n\n노인 쪽은 자료가 부족해서 어디서부터 시작해야 할지 모르겠어요.\n\n혹시 노인체육 구술 경험 있으신 분 팁 좀 부탁드립니다.",
    author: "미숫가루맛",
    date: "2026-04-14 20:53:00",
    comments: [
      { author: "식혜한사발", content: "구술 기간이 되면 진단지에서 큰 도움을 받으실 거예요" },
      { author: "수정과맛좋", content: "장체 구술 정보 공유해주신 분 있으니 공지 참고하세요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 실기 전 꿀팁 - 카페인과 워밍업",
    content:
      "실기 시험 전에 참고하시면 좋을 팁 공유합니다.\n\n1. 스타트 전에 크게 숨 쉬면서 배영 벽받기를 확실히 하세요.\n\n2. 점점 도착할 때 항상 1초 2초 기다린다 생각하세요.\n\n3. 실전에서 마음이 급하면 스타트가 급해지니 조심.\n\n4. 시험장 처음 가면 턴 연습 못하니 레인 길이 파악만 해두세요.\n\n5. 카페인은 30분 전에 커피 한잔 정도면 적당합니다.",
    author: "카푸치노거품",
    date: "2026-04-16 08:38:00",
    comments: [
      { author: "플랫화이트", content: "벽받기 확실히 하는게 핵심이죠 좋은 정보 감사" },
      { author: "콜드브루맛", content: "카페인은 처음 먹는 건 시험 당일에 하지 마세요" },
      { author: "드립커피향", content: "바나나 + 꿀물도 좋아요 에너지 보충에" },
    ],
  },
  {
    categoryId: 1,
    title: "이 방에서 같이 공부해서 정말 다행이었습니다",
    content:
      "시험 끝나고 보니 이 방에 들어와서 정말 다행이었어요.\n\n질문에 답해주시고 도움 주신 분들 모두 감사합니다.\n\n방장님이 만드신 자료도 너무 좋았고\n\n서로 얼굴 못 본 사이지만 얼굴 본 사이보다 더 거침없고 솔직하고.\n\n합격하고 나서 필기 후기 올리고 싶습니다.\n\n다들 좋은 결과 있길 바랍니다!",
    author: "꿀호떡사랑",
    date: "2026-04-18 11:52:00",
    comments: [
      { author: "호떡팥소맛", content: "이 방이 있어서 행복했습니다 다들 합격하세요" },
      { author: "씨앗호떡맛", content: "방장님 진짜 감사해요 모의고사도 만들어주시고" },
      { author: "녹차호떡맛", content: "합격하고 나서 꼭 후기 올려주세요!" },
      { author: "치즈호떡꿀", content: "서로 응원하면서 공부한 게 큰 힘이 됐어요" },
    ],
  },
  {
    categoryId: 1,
    title: "시험 당일 장 트러블 걱정되는 분들",
    content:
      "저 매일 오전 9시에서 11시 사이에 꼭 용변 신호가 오거든요.\n\n시험 중에 화장실 가고 싶어질까봐 걱정이 됐는데\n\n전날 밤에 가볍게 물 마시고 아침은 일찍 먹어서\n\n미리 장실 갔다가 시험장 이동했더니 괜찮았어요.\n\n장청소약은 오히려 하루종일 배 아파서 비추입니다.",
    author: "포켓몬빵맛",
    date: "2026-04-16 15:55:00",
    comments: [
      { author: "띠부띠부씰", content: "ㅋㅋㅋ 공감됩니다 저도 아침에 꼭 가야해서" },
      { author: "스티커모음집", content: "100분밖에 안 되니까 충분히 참을 수 있어요" },
    ],
  },
  {
    categoryId: 1,
    title: "일하면서 공부 진짜 힘드네요 직장인 분들 응원합니다",
    content:
      "직장 다니면서 공부하는데 너무 힘듭니다.\n\n퇴근하면 공부해야 하는데 시간이 없어요.\n\n금요일 연차 내고 달립니다.\n\n하루 종말하다 진짜.\n\n일하면서 합격하신 분들 존경합니다.\n\n동기부여도 아주 중요합니다.",
    author: "삼각김밥참치",
    date: "2026-04-15 10:01:00",
    comments: [
      { author: "주먹밥볶음", content: "연차 내고 공부하는거 진짜 대단합니다 화이팅" },
      { author: "유부초밥맛", content: "일하면서 하는거 쉽지 않죠 저도 야간에 공부중" },
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
