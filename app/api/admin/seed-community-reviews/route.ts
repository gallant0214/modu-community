import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { REGION_GROUPS } from "@/app/lib/region-data";

export const dynamic = "force-dynamic";

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const w = ["SEOUL","SEOUL","SEOUL","SEOUL","SEOUL","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","BUSAN","BUSAN","BUSAN","INCHEON","INCHEON","INCHEON","DAEGU","DAEGU","DAEJEON","DAEJEON","GWANGJU","GWANGJU","GYEONGNAM","GYEONGNAM","GYEONGBUK","GYEONGBUK","CHUNGNAM","CHUNGNAM","JEONNAM","JEONBUK","CHUNGBUK","GANGWON","ULSAN","SEJONG","JEJU"];
function pickRegion(): string {
  const c = pick(w);
  const g = REGION_GROUPS.find((x) => x.code === c);
  if (!g) return "서울특별시 - 강남구";
  return `${g.name} - ${pick(g.subRegions).name}`;
}

interface PostData {
  categoryId: number;
  title: string;
  content: string;
  author: string;
  date: string;
  comments: { author: string; content: string }[];
}

const newPosts: PostData[] = [
  {
    categoryId: 5,
    title: "자유형 50m 35초 벽이 도저히 안깨지네요",
    content: "자유형 50m가 40초에서 36초까지 줄었는데 35초 벽을 못 넘고 있어요\n\n킥을 더 차야 하나 스트로크를 길게 해야 하나 둘 다 시도해봤는데 답이 안나옵니다\n\n호흡 횟수 줄이는 것도 해봤는데 25m 한번 호흡으로는 어려워서요\n\n35초 벽 깨신 분들 비결 좀 알려주세요",
    author: "청소기",
    date: "2026-04-23 12:00:00",
    comments: [
      { author: "헤어드라이어", content: "캐치 구간 잡는 게 핵심이에요 팔꿈치 높이 유지하고 당기는 힘 만드세요" },
      { author: "토스터기", content: "스타트랑 턴에서 1초씩 줄이는 게 빨라요 순수 수영은 한계가 있어요" },
      { author: "전기포트", content: "킥은 6비트로 가되 무릎 안 구부리게 하세요 종아리에서 차야 합니다" },
    ],
  },
  {
    categoryId: 5,
    title: "IM100 1:30 페이스 잡는 드릴 추천 부탁드려요",
    content: "생체 수영 IM100 기준이 남자 1:30 여자 1:40인데\n\n저는 1:42에서 안 줄어들고 있습니다\n\n3-3-3 드릴 같은거 들어봤는데 효과 있을까요\n\n다른 좋은 드릴 있으면 추천해주세요",
    author: "가습기",
    date: "2026-04-23 14:30:00",
    comments: [
      { author: "제습기", content: "3-3-3 드릴 좋아요 킥 3번 스트로크 1번 박자 잡기 딱이에요" },
      { author: "공기청정기", content: "평영이랑 접영 페이스 분배가 제일 중요합니다 너무 빨리 가면 자유형에서 무너져요" },
      { author: "블루투스스피커", content: "IM은 4종목 골고루 연습이 답이에요 강한 종목이 약한 종목 못 살립니다" },
      { author: "무선이어폰", content: "1:42면 충분히 1:40 안에 들어옵니다 자신감 가지세요" },
    ],
  },
  {
    categoryId: 5,
    title: "다이빙 반포 물속 출발 어느게 제일 빠른가요",
    content: "출발 종류 3가지 중에 어떤걸 써야할지 고민입니다\n\n다이빙이 제일 빠르다고 들었는데 배치기 위험하고\n반포는 안정적이지만 다이빙보다 0.5초 정도 느리고\n물속은 안전하지만 1.5~2초 느리고\n\n실기 시험장에서 다들 어떤거 쓰시나요",
    author: "무선마우스",
    date: "2026-04-23 17:00:00",
    comments: [
      { author: "키보드", content: "기록 노리시면 다이빙이 답인데 입수 각도 연습 충분히 하세요" },
      { author: "충전케이블", content: "물속 출발도 1초 정도 차이밖에 안나요 본인 안정감 있는걸로 가세요" },
      { author: "전기레인지", content: "반포 출발 추천합니다 다이빙은 시험장 스타트대 적응 안되면 망해요" },
      { author: "인덕션", content: "감독관 신호 들리면 무조건 빠르게 출발이 핵심 출발 종류는 부차적" },
    ],
  },
  {
    categoryId: 5,
    title: "배영에서 자유형 넘어갈 때 등 터치 기준이 뭔가요",
    content: "IM에서 배영 끝내고 자유형 시작할 때\n\n등으로 벽 터치 안하면 DQ라고 들었는데\n\n등을 어디까지 보여야 하는건가요? 어깨까지? 견갑골까지?\n\n그리고 손을 먼저 터치하면 안되는 거 맞죠?",
    author: "식기세척기",
    date: "2026-04-24 09:30:00",
    comments: [
      { author: "김치냉장고", content: "어깨 견갑골 라인까지 보여야 안전해요 90도 살짝 넘게 돌아주세요" },
      { author: "에어프라이어", content: "손이 먼저 닿으면 바로 DQ 등 부분이 먼저 닿아야 합니다" },
      { author: "커피머신", content: "심판이 보기에 명확하게 등 보여야 하니까 좀 과하다 싶을 정도로" },
    ],
  },
  {
    categoryId: 5,
    title: "크로스오버턴 진짜 DQ 맞나요? 멋있어보여서 연습 중인데",
    content: "유튜브 보면 선수들 배영-자유형 갈 때 크로스오버턴으로 빠르게 도는데\n\n실기 시험에서는 절대 하지 말라는 말이 있어서요\n\n진짜 DQ인가요? 시간 차이가 좀 나서 욕심나는데 위험하면 안 하려구요",
    author: "핸드믹서",
    date: "2026-04-24 11:30:00",
    comments: [
      { author: "블렌더", content: "절대 하지 마세요 작년에 크로스오버턴으로 DQ 먹은 사람 직접 봤어요" },
      { author: "전기밥솥", content: "선수들도 규칙 안에서 하는거지 우리는 오픈턴이 답입니다" },
      { author: "안마기", content: "1초 줄이려다 1년 날립니다 안전한 오픈턴 추천해요" },
      { author: "정수기", content: "크로스오버턴은 등 터치 인정이 애매해서 심판마다 판정이 다를 수 있어요" },
    ],
  },
  {
    categoryId: 5,
    title: "평영 시작할 때 돌핀킥 1번만 허용 맞나요",
    content: "평영에서 출발이나 턴 후에 돌핀킥 한 번 차도 된다고 들었는데\n\n2번 차면 DQ인가요? 1번까지만 허용이면 정확히 어떤 동작까지인지\n\n시험장에서 애매하면 안하는게 나을지 고민됩니다",
    author: "제빵기",
    date: "2026-04-24 14:00:00",
    comments: [
      { author: "청소기", content: "FINA 규정상 1번까지 허용이고 2번 이상 차면 DQ에요" },
      { author: "헤어드라이어", content: "애매하면 차지 마세요 안 차도 페이스 충분히 잡힙니다" },
      { author: "토스터기", content: "최근 규정 바뀌어서 1번 허용된 거예요 예전엔 안됐어요" },
    ],
  },
  {
    categoryId: 5,
    title: "접영 마지막 터치 양손 동시에 안하면 DQ인가요",
    content: "접영 마지막 벽 터치할 때 양손 동시에 닿아야 한다고 들었는데\n\n한손이 먼저 살짝 닿으면 그것도 DQ인가요\n\n파도 때문에 양손 동시 터치가 어려운 경우 어떻게 하시나요",
    author: "전기포트",
    date: "2026-04-25 10:00:00",
    comments: [
      { author: "가습기", content: "양손 동시 + 같은 높이가 기본이에요 한손이 먼저 닿으면 DQ" },
      { author: "제습기", content: "마지막 스트로크 강하게 만들고 양손 펴서 같이 들어가세요" },
      { author: "공기청정기", content: "파도 안나도록 마지막 스트로크 천천히 부드럽게 들어가는 연습 하세요" },
      { author: "블루투스스피커", content: "심판이 명확하게 양손 동시 확인 못하면 의심하니까 확실하게 하세요" },
    ],
  },
  {
    categoryId: 5,
    title: "장체 수영 IM200 기준기록 통과 어렵나요",
    content: "장애인스포츠지도사 수영은 IM200이 기본 종목이라고 들었어요\n\n기준기록이 2분 5초 정도라고 하던데 이게 그렇게 빡빡한 건가요\n\n생체 IM100 1:30보다 어떻게 보면 여유 있는거 같기도 한데\n\n장체 준비하시는 분들 어떠신가요",
    author: "무선이어폰",
    date: "2026-04-25 13:00:00",
    comments: [
      { author: "무선마우스", content: "거리 길어서 페이스 분배가 더 어려워요 체력이 핵심입니다" },
      { author: "키보드", content: "200은 마지막 자유형에서 무너지는 분들 많아요 후반 페이스 연습하세요" },
      { author: "충전케이블", content: "기준은 여유 있어 보여도 4종목 200m라 진짜 힘들어요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 강사 가산점 자격증 인명구조사 수구사 어디 등록?",
    content: "수영 강사 채용공고 보니까 가산점 자격증으로\n\n인명구조사 + 수구사 1급 + 응급처치 자격증\n\n이런게 다 있어야 한다고 하던데\n\n어디서 등록하고 시험은 언제 보는지 정보 좀 부탁드립니다",
    author: "전기레인지",
    date: "2026-04-26 11:00:00",
    comments: [
      { author: "인덕션", content: "인명구조사는 적십자에서 등록 가능하고 시험은 매월 있어요" },
      { author: "식기세척기", content: "수구사 1급은 라이프가드 자격이라 별도 시험 봐야 합니다" },
      { author: "김치냉장고", content: "응급처치는 보건복지부 인증된 곳 어디든 가능해요" },
      { author: "에어프라이어", content: "공공수영장 채용은 가산점 다 있어야 면접도 갑니다" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 IM100 1조 9:40 직장인은 어떻게 시간 빼시나요",
    content: "수영 실기 시험 1조 시간이 9:40인데\n\n직장인이라 휴가 1시간으로는 못 가는 시간이라\n\n반차 써야할거 같은데 시간이 빠듯합니다\n\n다들 하루 휴가 내고 가시나요? 새벽에 출발하시나요?",
    author: "커피머신",
    date: "2026-04-26 16:00:00",
    comments: [
      { author: "핸드믹서", content: "그냥 하루 통째로 비우는게 마음 편해요 시험 끝나고 정신없습니다" },
      { author: "블렌더", content: "조 시간보다 1시간 일찍 도착해서 몸 풀어야 하니까 더 일찍 출발하세요" },
      { author: "전기밥솥", content: "지방에서 가시는 분들은 전날 가서 자고 가는 것도 방법이에요" },
      { author: "안마기", content: "1조는 부담스러운데 마지막 조 받으면 또 너무 늦어서 애매해요" },
    ],
  },
  {
    categoryId: 5,
    title: "노인스포츠지도사 수영 6/8 마감 안전하게 가나요",
    content: "노인스포츠지도사 수영 종목으로 신청하려는데\n\n등록 마감이 6/8이라고 하더라고요\n\n노인 수영은 자료가 정말 없어서 준비가 막막한데\n\n노인 수영 보신 분들 어떻게 준비하셨나요",
    author: "정수기",
    date: "2026-04-27 10:00:00",
    comments: [
      { author: "제빵기", content: "노인체육론 위주로 보세요 노인 특성 + 안전관리가 핵심입니다" },
      { author: "청소기", content: "노인 수영 구술은 낙상예방 + 심혈관 안전 위주로 정리해야 해요" },
      { author: "헤어드라이어", content: "생체 자료 베이스로 노인 특성 추가해서 준비하시는게 효율적" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 강사 시급 정말 2만원이 평균인가요",
    content: "수영 강사로 취업 알아보는 중인데\n\n공공수영장 시급이 2만원 전후라고 하더라고요\n\n자격증 따려고 한 시간/돈/노력 대비 처우가 너무 적은거 아닌가 싶어서\n\n현직 강사분들 실제 어떠신지 궁금합니다",
    author: "토스터기",
    date: "2026-04-27 14:30:00",
    comments: [
      { author: "전기포트", content: "공공은 그렇고 사설 수영장은 시급 3만원 이상이에요 4대보험 안되긴 하지만" },
      { author: "가습기", content: "개인레슨 잡으시면 시간당 5~10만원도 가능합니다 영업력이 핵심" },
      { author: "제습기", content: "구청 스포츠센터가 그나마 처우 좋아요 4대보험 + 정기 인상" },
      { author: "공기청정기", content: "어린이 수영교실 강사가 안정적이긴 해요 학부모 컴플레인이 좀 많지만" },
    ],
  },
  {
    categoryId: 5,
    title: "다이빙 5m 안에서 사이드 다이빙도 가능한가요",
    content: "다이빙 출발에서 5m 안쪽이 위험한 구간이라고 하던데\n\n사이드로 다이빙 들어가는 것도 가능한가요\n\n수면에 가까이 입수하면 더 빠르다고 들어서\n\n시험장에서 시도해봐도 될지 고민됩니다",
    author: "블루투스스피커",
    date: "2026-04-27 17:30:00",
    comments: [
      { author: "무선이어폰", content: "사이드 다이빙은 시험장에서 안 하시는게 좋아요 변수가 너무 많아요" },
      { author: "무선마우스", content: "안전한 정면 다이빙 + 입수각 45도가 가장 안정적입니다" },
      { author: "키보드", content: "5m 이후엔 자유롭게 차도 되지만 출발 직후엔 정석대로 가세요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 필기 결과 5/8 발표 후 3주 안에 실기 준비 가능?",
    content: "수영 종목 필기 결과가 5/8 발표라고 하던데\n\n그 후에 실기 준비 시작하면 5/22~7월 초까지 약 3주\n\n이 기간 안에 IM100 1:30 안에 들어오는게 가능할까요\n\n불합격 가능성 생각하면 미리 시작하기도 애매하고",
    author: "충전케이블",
    date: "2026-04-28 10:30:00",
    comments: [
      { author: "전기레인지", content: "지금부터 시작하시는게 좋아요 합격 가능성 75%면 무조건 미리 준비" },
      { author: "인덕션", content: "3주는 너무 짧아요 기록 단축은 최소 2개월 이상 잡아야 합니다" },
      { author: "식기세척기", content: "필기 결과 기다리지 말고 바로 시작하세요 어차피 자격증 취득 후에도 수영은 도움됩니다" },
      { author: "김치냉장고", content: "결과 받고 시작하면 늦어요 가채점 320점 이상이면 미리 준비 추천" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 실기 출발 신호 단계별로 어떻게 진행되나요",
    content: "수영 실기 출발 신호 설명 보다가\n\n호각 1차 2차 3차 출발신호 이런 단계가 있다는데\n\n정확히 어떤 순서로 진행되는지 모르겠어요\n\n출발 신호 단계별로 설명해주실 분 부탁드립니다",
    author: "에어프라이어",
    date: "2026-04-28 11:30:00",
    comments: [
      { author: "커피머신", content: "1차 호각 = 정렬 / 2차 = 출발대 위로 / 3차 = take your marks / 4차 = 출발신호 이렇게 진행돼요" },
      { author: "핸드믹서", content: "신호 단계는 시험장마다 약간 달라서 시작 전 안내방송 잘 들으세요" },
      { author: "블렌더", content: "출발 신호 듣자마자 반응속도가 0.5초 차이를 만듭니다 연습 많이 하세요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 실기 응시료 6만원 12만원 어느게 맞나요",
    content: "수영 실기 시험 응시료 정보가 헷갈려서요\n\n공식 공고에는 6만원이라고 되어있는데 12만원 냈다는 분도 계시고\n\n장체나 노인 종목은 다른건가요\n\n정확한 금액 아시는 분 부탁드립니다",
    author: "전기밥솥",
    date: "2026-04-28 16:00:00",
    comments: [
      { author: "안마기", content: "기본 6만원이고 추가종목 신청하면 12만원이에요 본인 신청 확인하세요" },
      { author: "정수기", content: "장체랑 노인은 별도 응시료 있을 수 있으니까 공고문 확인 필수" },
      { author: "제빵기", content: "결제 영수증 잘 보관하세요 환불 신청할 때 필요해요" },
      { author: "청소기", content: "공단 사이트에서 영수증 출력 가능합니다 미리 받아두세요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 실기 강원 → 인천, 부산 → 양산 진짜인가요",
    content: "수영 실기 시험장 정보 정리하다가\n\n강원도 시험이 인천으로 통합됐고 부산은 미개최라 양산으로 가야 한다는 얘기 들었는데\n\n진짜 맞나요? 원거리 응시자는 KTX 일정 미리 잡아야 할거 같아서요",
    author: "헤어드라이어",
    date: "2026-04-29 11:00:00",
    comments: [
      { author: "토스터기", content: "맞아요 부산 안 열려서 양산 시험장으로 다 몰리는 상황입니다" },
      { author: "전기포트", content: "강원분들 인천 시험장까지 오시면 숙박 잡고 가시는걸 추천해요" },
      { author: "가습기", content: "공고문 다시 한번 확인하시고 시험장 변경 신청도 가능합니다" },
      { author: "제습기", content: "양산 시험장 KTX 표 미리 끊으세요 시험일 임박해서 매진됩니다" },
    ],
  },
  {
    categoryId: 5,
    title: "장체 25m 자유형 28-29초면 합격선 안전한가요",
    content: "장체 수영 25m 자유형 기준이 28-29초라고 들었는데\n\n저는 30초에서 안 줄어드는 상태입니다\n\n2-3초 줄이려면 어떤 부분에 집중해야 할까요\n\n폼이 문제인지 체력이 문제인지 모르겠어요",
    author: "키보드",
    date: "2026-04-29 15:00:00",
    comments: [
      { author: "충전케이블", content: "스타트랑 턴에서 1초씩 잡으시는게 빨라요 순수 영법은 한계가 있어요" },
      { author: "전기레인지", content: "30초면 1-2초만 더 줄이면 됩니다 호흡 횟수 줄이는 연습부터 하세요" },
      { author: "인덕션", content: "25m면 한번 호흡으로 가는 연습 추천드려요 그것만 해도 1초 빠집니다" },
      { author: "식기세척기", content: "캐치 잘 잡고 푸시 강하게 하면 자연스럽게 빨라집니다" },
    ],
  },
  {
    categoryId: 5,
    title: "26년 수영 실기 공고 4/30 발표 떴습니다",
    content: "오늘 4/30에 26년 수영 실기 공고 올라왔어요\n\n체육지도사 사이트에서 확인 가능하고 시험 일정이랑 시험장 다 나와있습니다\n\n다들 일정 확인하시고 접수 준비하세요",
    author: "공기청정기",
    date: "2026-04-30 11:30:00",
    comments: [
      { author: "블루투스스피커", content: "오 드디어 떴네요 바로 확인하러 갑니다" },
      { author: "무선이어폰", content: "공유 감사합니다 일정 확인하고 접수 준비할게요" },
      { author: "무선마우스", content: "시험장이 작년이랑 좀 다르네요 미리 봐두시는게 좋아요" },
    ],
  },
  {
    categoryId: 5,
    title: "수영 실기 마지막 자유형에서 페이스 떨어지는 거 어떻게 해야 하나요",
    content: "IM100 마지막 자유형 25m에서 페이스가 확 떨어져요\n\n앞에 3종목에서 체력을 다 써서 그런것 같은데\n\n페이스 분배를 어떻게 해야 마지막까지 버틸 수 있는지\n\n경험자분들 조언 부탁드립니다",
    author: "김치냉장고",
    date: "2026-04-30 14:00:00",
    comments: [
      { author: "에어프라이어", content: "초반 접영에서 50% 정도로 가시고 후반 페이스 남겨두세요" },
      { author: "커피머신", content: "평영을 쉬어가는 구간으로 잡으면 자유형까지 페이스 유지 가능합니다" },
      { author: "핸드믹서", content: "마지막 자유형 25m는 무조건 모든걸 쏟아부어야 해요 거기서 시간 다 잡아먹으면 끝" },
    ],
  },
];

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  let postsInserted = 0;
  let commentsInserted = 0;

  for (const post of newPosts) {
    const region = pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;

    const { data: insertedPost, error: postErr } = await supabase
      .from("posts")
      .insert({
        category_id: post.categoryId,
        title: post.title,
        content: post.content,
        author: post.author,
        password: "__seed_community__",
        region,
        tags: "기타",
        ip_address: "seed_community",
        created_at: post.date,
        updated_at: post.date,
        views,
      })
      .select("id")
      .single();

    if (postErr || !insertedPost) {
      continue;
    }
    postsInserted++;
    const postId = insertedPost.id;

    for (const c of post.comments) {
      const cd = new Date(post.date);
      cd.setHours(cd.getHours() + Math.floor(Math.random() * 48) + 1);
      cd.setMinutes(Math.floor(Math.random() * 60));

      const { error: cErr } = await supabase.from("comments").insert({
        post_id: postId,
        author: c.author,
        password: "__seed_community__",
        content: c.content,
        ip_address: "seed_community",
        created_at: cd.toISOString(),
      });
      if (!cErr) commentsInserted++;
    }

    const { count } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);
    await supabase
      .from("posts")
      .update({ comments_count: count ?? 0 })
      .eq("id", postId);
  }

  return NextResponse.json({ success: true, postsInserted, commentsInserted });
}
