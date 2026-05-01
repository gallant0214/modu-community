import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { invalidateCache } from "@/app/lib/cache";
import { REGION_GROUPS } from "@/app/lib/region-data";

export const dynamic = "force-dynamic";

async function flushCommunityCache(categoryIds: number[]) {
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  for (const id of categoryIds) revalidatePath(`/category/${id}`);
}

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
  // ===== 23차 시드: 보디빌딩 오픈채팅 게시글 20개 (2026-04-23~30) =====
  {
    categoryId: 1,
    title: "보디빌딩 실기 구술 카드 직접 만드는게 나을까요",
    content: "필기 합격하고 실기구술 준비 시작했는데\n\n시판 카드는 비싸고 코쿠덴 같은거 4단 묶음으로 11000원이더라고요\n\n그냥 기출 정리해서 직접 만드는게 나을지 카드 사는게 나을지 고민이에요\n\n경험자분들 의견 부탁드립니다",
    author: "물통뚜껑",
    date: "2026-04-23 12:34:00",
    comments: [
      { author: "삼각자", content: "직접 만드는게 머리에 더 잘 남아요 추천드립니다" },
      { author: "클립보드", content: "저는 코쿠덴 사서 봤는데 정리는 잘 되어있어요" },
      { author: "형광펜", content: "구술은 본인이 직접 정리해야 답변할 때 자연스럽게 나옴" },
      { author: "메모지", content: "둘 다 해보세요 카드 사고 본인 노트 따로 만들면 베스트" },
    ],
  },
  {
    categoryId: 1,
    title: "시험장마다 구술 동작이 다른가요?",
    content: "구술이랑 실기 동작이 시험장마다 다르다는 말이 있던데\n\n진짜 그런가요? 같은 회차여도 다 다르게 나오는건지\n\n어디 시험장이 그래도 좀 쉽게 나오는지 정보 좀 부탁드려요",
    author: "커튼봉",
    date: "2026-04-23 14:50:00",
    comments: [
      { author: "바인더", content: "시험장마다 다르고 같은 시험장도 조마다 달라요" },
      { author: "스탠드", content: "복불복이라 그냥 다 준비하는게 답입니다" },
      { author: "볼펜꽂이", content: "감독관 성향에 따라서도 좀 다르긴 해요" },
    ],
  },
  {
    categoryId: 1,
    title: "25년 단국대 6/27 1조 9:40 보디빌딩 실기 기출 정리",
    content: "작년 단국대 시험 기출입니다 참고하세요\n\n실기:\n- 바벨 리버스 리스트컬\n- 덤벨 프론트 레이즈\n- 어깨 위로 트라이 익스텐션\n- 와이드 스탠스 바벨 스쿼트\n- 클래식 보디빌딩 포즈\n\n구술:\n- 남성 피지크 복장규정\n- 스포츠 폭력의 원인\n- 회전 지방산\n- 광배근 강화 운동 4가지 이상\n\n시험장마다 다르긴 한데 비슷한 패턴이라 참고하시면 좋아요",
    author: "지우개",
    date: "2026-04-23 18:15:00",
    comments: [
      { author: "삼각자", content: "정리 감사합니다 광배근 강화 운동 4가지 외워야겠네요" },
      { author: "클립보드", content: "트라이 익스텐션 어깨 위로면 오버헤드 익스텐션이군요" },
      { author: "필통", content: "남자 피지크 복장규정 이거 자주 나오네요" },
      { author: "책꽂이", content: "단국대 후기 늘 도움됩니다 감사합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "클래식피지크랑 보디빌딩 규정포즈 차이가 뭔가요",
    content: "둘 다 보디빌딩 규정포즈라고 되어있는데\n\n뭐가 차이인지 모르겠어요\n\n남자 7개 포즈 같은건가요 아니면 따로 익혀야 하나요?",
    author: "스테이플러",
    date: "2026-04-24 10:20:00",
    comments: [
      { author: "형광펜", content: "남자 보디빌딩 7개 포즈 + 클래식 보디빌딩 쿼터턴 4개로 나뉩니다" },
      { author: "볼펜꽂이", content: "기본 7개 포즈는 같고 클래식이 쿼터턴 추가되는 거에요" },
      { author: "물통뚜껑", content: "체육회 자료에 둘 다 정리되어있으니 한번 보세요" },
    ],
  },
  {
    categoryId: 1,
    title: "실기 4동작 + 포즈 1개 + 구술 4개 구성 맞나요",
    content: "실기 시험 구성이\n\n실기 4동작 (3 동작 + 트라이/컴파운드/이소레이션 중 하나)\n포즈 1개\n구술 4개\n\n이거 맞나요? 동작이랑 구술 비율 알아두면 시간 분배에 도움될거 같아서요",
    author: "연필깎이",
    date: "2026-04-24 14:10:00",
    comments: [
      { author: "책갈피", content: "맞습니다 실기 4 + 포즈 1 + 구술 4 구성이에요" },
      { author: "자석클립", content: "트라이 인서트랑 아이소인서트는 공문에 안나오기도 합니다" },
      { author: "지우개", content: "구성 정리 감사해요 시간 분배에 참고할게요" },
      { author: "스탠드", content: "포즈 1개라도 확실히 외워가세요 0점 처리되면 큰일" },
    ],
  },
  {
    categoryId: 1,
    title: "25년부터 복근 트위스트 해피포즈 삭제됐어요",
    content: "혹시 모르시는 분 있을까봐 다시 공유합니다\n\n25년부터 보디빌딩 실기에서\n\n복근 트위스트, 해피포즈 동작이 삭제됐어요\n\n예전 자료보고 연습하면 안되니까 체육회 공지 꼭 확인하세요",
    author: "바인더",
    date: "2026-04-24 16:30:00",
    comments: [
      { author: "메모지", content: "이거 모르고 연습할뻔 했네요 감사합니다" },
      { author: "커튼봉", content: "유튜브에 옛날 영상도 많아서 헷갈리니까 공지 우선이에요" },
      { author: "필통", content: "변경사항 매년 체크하는게 진짜 중요함" },
    ],
  },
  {
    categoryId: 1,
    title: "실기 시험 옷차림 마스크 칸막이 가려도 되나요",
    content: "포즈 시연할 때 옷 입고 하는거 너무 부담스러워서요\n\n칸막이 마스크 같은걸로 가리고 시험 볼 수 있나요\n\n경험해보신 분 알려주세요",
    author: "책꽂이",
    date: "2026-04-24 18:25:00",
    comments: [
      { author: "삼각자", content: "칸막이 마스크 쓰고 한 적 있는데 괜찮으셨대요 다만 요구하면 잠깐 얼굴 확인은 하셨다고" },
      { author: "물통뚜껑", content: "옷 입고 하긴 하는데 약간 어색해서 다들 비슷한 스트레스" },
      { author: "스테이플러", content: "복장 규정 안에서 본인이 편한 걸로 가시면 됩니다" },
    ],
  },
  {
    categoryId: 1,
    title: "구술 PDF 무료자료 어디서 구하나요",
    content: "구술 준비하는데 무료자료 찾고 있어요\n\n네이버 카페나 블로그에서 구할 수 있다는데 좋은 자료 추천 부탁드립니다\n\n시판 자료 사기 전에 무료부터 보고 싶어서요",
    author: "자석클립",
    date: "2026-04-24 20:45:00",
    comments: [
      { author: "연필꽂이", content: "네이버 카페에서 기출 정리 PDF 자주 올라와요 가입하시면 됩니다" },
      { author: "책갈피", content: "유튜브 댓글에 자료 링크 거는 분들도 있으니 확인" },
      { author: "지우개", content: "결국 본인이 정리해야 머리에 남으니까 자료는 참고용으로만" },
      { author: "형광펜", content: "오픈카톡방 들어가면 족보 공유해주는 분들 계세요" },
    ],
  },
  {
    categoryId: 1,
    title: "보디빌딩 → 노인 장애인 추가취득 절차 정리",
    content: "보디빌딩 자격증 있는 상태에서 노인 장애인 추가 취득 알아봤어요\n\n일반 과정: 90시간 + 현장실습 3일\n특별 과정: 40시간 + 현장실습 1일\n\n어떤거 받을 수 있는지는 본인 자격에 따라 다르니 체육회 확인 필요합니다\n\n특별과정이 시간 짧아서 직장인분들한테 좋아요",
    author: "필통",
    date: "2026-04-25 11:00:00",
    comments: [
      { author: "메모지", content: "특별과정 40시간이면 휴가 좀만 쓰면 되겠네요" },
      { author: "바인더", content: "추가취득은 시험 안보고 연수만 들으면 됩니다 좋아요" },
      { author: "커튼봉", content: "노인 장애인 동시에 신청 가능한지도 확인해보세요" },
      { author: "스탠드", content: "정리 감사합니다 저도 노인 추가취득 알아보고있어요" },
    ],
  },
  {
    categoryId: 1,
    title: "체지방 148% 골격근 148kg도 응시 가능한가요",
    content: "체격 컨디션 안좋아도 시험 응시 자체는 되는지 궁금해서요\n\n체지방률이나 골격근량 같은 신체 조건 제한이 있나요?",
    author: "볼펜꽂이",
    date: "2026-04-25 13:20:00",
    comments: [
      { author: "삼각자", content: "전혀 상관없습니다 신체 조건 제한 없어요" },
      { author: "책꽂이", content: "크리스 범스타드도 시험 보러 와도 통과합니다 ㅋㅋ" },
      { author: "물통뚜껑", content: "포즈만 정확하게 하면 되니까 체격은 무관해요" },
      { author: "필통", content: "복장 규정만 지키면 되고 체격 평가는 안합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "구술 카드 - 코쿠덴 4단 묶음 vs 직접 노트",
    content: "구술 카드 두고 고민 중인데\n\n코쿠덴 4단 묶음으로 시판된거 11000원\n vs\n직접 노트 정리 (시간은 걸리지만 머리에 남음)\n\n둘 중 어떤게 효율적일까요?",
    author: "연필꽂이",
    date: "2026-04-26 10:30:00",
    comments: [
      { author: "지우개", content: "직접 만드는게 시간 걸려도 시험장에서 답 잘 나옵니다" },
      { author: "스테이플러", content: "코쿠덴은 정리는 깔끔한데 본인 약점이 안 보이는게 단점" },
      { author: "자석클립", content: "둘 다 사용해도 되긴 한데 본인 노트 비중을 더 높이세요" },
    ],
  },
  {
    categoryId: 1,
    title: "강원→인천 통합 부산 미개최 시험장 변동",
    content: "올해 시험장 정보 정리합니다\n\n강원도 시험이 인천 시험장으로 통합됐다는 얘기 들었고\n부산은 시험 미개최라 양산이나 다른 지역으로 가야 한다고 하네요\n\n원거리 응시자분들 일정 미리 잡으세요",
    author: "메모지",
    date: "2026-04-26 14:15:00",
    comments: [
      { author: "삼각자", content: "부산 안열려서 양산까지 가야하는데 KTX 표 미리 끊어야겠어요" },
      { author: "형광펜", content: "강원분들 인천까지 오면 숙박 잡아야할듯" },
      { author: "커튼봉", content: "원거리 시험장 응시는 진짜 고생이네요" },
      { author: "바인더", content: "공지 잘 확인하시고 미리 준비하세요 시험장 변경 신청도 가능합니다" },
    ],
  },
  {
    categoryId: 1,
    title: "1조 9:40 시험 시간 직장인은 어떻게 가나요",
    content: "단국대 1조 시간이 9:40이던데 직장인은 휴가 1시간으로 못가는 시간이네요\n\n반차 써야할 거 같은데 다들 어떻게 시간 비우시나요?\n\n새벽에 출발해서 가시는지 궁금합니다",
    author: "스탠드",
    date: "2026-04-26 17:00:00",
    comments: [
      { author: "지우개", content: "저는 그냥 반차 썼어요 1시간 휴가로는 무리" },
      { author: "책꽂이", content: "오전 통째로 비우는게 마음 편합니다" },
      { author: "물통뚜껑", content: "시험장 가까운 곳 신청하면 그나마 나아요" },
    ],
  },
  {
    categoryId: 1,
    title: "26년 보디빌딩 실기 공고 4/30 발표 떴습니다",
    content: "오늘 4/30에 26년 보디빌딩 실기구술 공고 올라왔어요\n\n체육지도사 사이트에서 확인 가능하고\n시험 일정이랑 시험장 다 나와있습니다\n\n다들 일정 확인하시고 접수 준비하세요",
    author: "책갈피",
    date: "2026-04-30 11:30:00",
    comments: [
      { author: "물통뚜껑", content: "오 드디어 떴네요 바로 확인하러 갑니다" },
      { author: "삼각자", content: "공유 감사합니다 일정 확인하고 접수 준비할게요" },
      { author: "커튼봉", content: "시험장이 작년이랑 좀 다르네요 미리 봐두세요" },
      { author: "메모지", content: "접수 시작일 놓치면 안되니까 알람 맞춰두세요" },
    ],
  },
  {
    categoryId: 1,
    title: "실기 동작 4번 반복 후 그만 신호 시험관마다 다른가요",
    content: "동작 몇번 반복하면 그만이라고 하는지 시험관마다 다르나요?\n\n3번 4번까지 한 사람도 있고 1~2번에서 멈추라고 한 경우도 있다는데\n\n어디까지 해야 하는지 감이 안잡혀요",
    author: "포스트잇",
    date: "2026-04-27 10:30:00",
    comments: [
      { author: "삼각자", content: "보통 3~4회 반복하면 신호 줍니다 천천히 정확하게 하세요" },
      { author: "스테이플러", content: "감독관마다 좀 다르긴 한데 신호 나오면 바로 멈추면 돼요" },
      { author: "필통", content: "너무 빨리 하지 말고 한번 한번 정확하게가 핵심" },
      { author: "자석클립", content: "동작 시작 자세부터 마무리까지 천천히 보여주세요" },
    ],
  },
  {
    categoryId: 1,
    title: "구술 기출 - CPR 깊이 하체근육 필수아미노산 정리",
    content: "구술 빈출 기출 정리해봤어요\n\n- CPR 가슴압박 깊이: 성인 5cm, 소아 4~5cm\n- 하체근육 3가지: 대퇴사두근, 대퇴이두근, 비복근\n- 필수아미노산 9가지 중 3개: 류신, 이소류신, 발린 (BCAA)\n- 광배근 강화 운동: 풀업, 랫풀다운, 시티드 로우, 벤트오버 로우\n- 응급처치 ABC: 기도 호흡 순환\n\n이런것들 자주 나오니까 외워가세요",
    author: "모눈노트",
    date: "2026-04-27 15:20:00",
    comments: [
      { author: "지우개", content: "정리 감사합니다 시험 직전에 다시 봐야겠어요" },
      { author: "책꽂이", content: "BCAA로 외우니까 필수아미노산 답 바로 나오네요" },
      { author: "형광펜", content: "광배근 운동 4가지 이상 답해야 하는 경우 많으니 4개 이상 외우세요" },
      { author: "볼펜꽂이", content: "응급처치 파트 의외로 자주 나옴 꼭 보세요" },
    ],
  },
  {
    categoryId: 1,
    title: "보디빌딩 추가취득 vs 처음부터 시험 어떤게 효율?",
    content: "다른 종목 자격 있어서 보디빌딩 추가취득으로 갈지\n아니면 처음부터 보디빌딩 시험 볼지 고민입니다\n\n추가취득은 연수만 들으면 되는데 시간이 오래 걸리고\n처음부터 보면 시간은 짧지만 시험 부담이 있고\n\n경험자분들 조언 부탁드려요",
    author: "종이클립",
    date: "2026-04-28 11:40:00",
    comments: [
      { author: "삼각자", content: "추가취득이 시험 부담 없어서 직장인은 그게 나아요" },
      { author: "필통", content: "시간 여유 있고 운동 좋아하시면 그냥 처음부터 보세요 빠르게 끝납니다" },
      { author: "메모지", content: "특별과정 40시간이면 추가취득이 훨씬 편합니다" },
      { author: "자석클립", content: "본인 시간 계산해보고 결정하세요 둘 다 장단점 있어요" },
    ],
  },
  {
    categoryId: 1,
    title: "도핑 이론 TUE 승인 불승인 외워야 하나요",
    content: "구술에서 도핑 이론 TUE 관련해서 물어볼 수 있다고 들었는데\n\nTUE가 뭔지 승인 불승인 기준을 외워가야 하나요?\n\n어디까지 깊이 봐야할지 감이 안잡혀요",
    author: "잉크펜",
    date: "2026-04-29 10:10:00",
    comments: [
      { author: "스테이플러", content: "TUE는 치료목적사용면책이고 기본 정의 정도는 외워가세요" },
      { author: "책갈피", content: "구술에 도핑 자주 나오니까 WADA 금지약물 분류는 알아두세요" },
      { author: "물통뚜껑", content: "심층 디테일까진 안나오는데 기본 개념은 필수입니다" },
      { author: "지우개", content: "도핑 파트는 응급처치랑 같이 한번에 정리하면 효율적" },
    ],
  },
  {
    categoryId: 1,
    title: "부산 시험장 통합 양산 이동 후기",
    content: "부산 시험장이 안 열려서 양산으로 이동했어요\n\nKTX로 부산역 가서 환승해서 양산 시험장까지 가는데\n총 4시간 걸렸습니다 새벽 5시 출발\n\n원거리 응시자분들 진짜 고생이에요 도시락 챙기시고 일정 여유있게 잡으세요",
    author: "컴퍼스",
    date: "2026-04-29 16:25:00",
    comments: [
      { author: "삼각자", content: "고생하셨네요 새벽 5시 출발이라니" },
      { author: "커튼봉", content: "내년에는 부산도 열렸으면 좋겠네요" },
      { author: "형광펜", content: "원거리는 진짜 숙박이 답인거 같아요 전날 가서 자고" },
    ],
  },
  {
    categoryId: 1,
    title: "26년 5월 23일~7월 초 시험 일정 어떻게 나와요",
    content: "5/23부터 7월 초까지 시험 본다고 하는데 실제로 일정이 어떻게 분배되는지 궁금합니다\n\n시험장별로 날짜가 다른건지 같은 시험장에서 여러 날 보는건지\n\n공고 보긴 했는데 정확히 모르겠어서요",
    author: "화이트보드",
    date: "2026-04-30 11:55:00",
    comments: [
      { author: "삼각자", content: "시험장마다 여러 날 진행돼요 본인 신청한 날짜 따라 가시면 됩니다" },
      { author: "메모지", content: "공고에 시험장별 일정표 첨부되어있으니 다시 확인해보세요" },
      { author: "물통뚜껑", content: "신청할 때 날짜 선택 가능하니까 일정 보고 잡으세요" },
      { author: "필통", content: "주말 시험장은 빨리 마감되니까 미리미리 신청하세요" },
    ],
  },
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as { password?: string; cacheOnly?: boolean }));
  const password = body.password ?? "";
  const cacheOnly = body.cacheOnly === true;
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const allCategoryIds = Array.from(new Set(newPosts.map((p) => p.categoryId)));

  if (cacheOnly) {
    await flushCommunityCache(allCategoryIds);
    return NextResponse.json({ success: true, cacheOnly: true, revalidated: ["/", "/community", ...allCategoryIds.map((id) => `/category/${id}`)] });
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

  await flushCommunityCache(allCategoryIds);

  return NextResponse.json({ success: true, postsInserted, commentsInserted });
}
