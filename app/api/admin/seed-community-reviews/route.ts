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

const existingPosts: PostData[] = [];

const newPosts: PostData[] = [
  // ===== 20차 시드: 수영 생체2급 오픈채팅 - 실기준비/IM기록/구술/자격증논의 (2026-04-19~22) =====

  {
    categoryId: 4,
    title: "수영 생체 IM100 기준기록 알려주실 분 계세요?",
    content:
      "이번에 수영으로 생체 2급 준비하려는데\n\nIM 100이 먼저인가요 구술이 먼저인가요?\n\n그리고 기준기록이 어떻게 되는지\n\n남자 여자 다르다고 들었는데\n\n정확한 정보를 모르겠습니다",
    author: "스크린도어센서감도",
    date: "2026-04-19 19:18:00",
    comments: [
      { author: "엘리베이터층수표시", content: "IM100이요 남자 1분40초 여자 1분44초입니다" },
      { author: "에스컬레이터속도조절", content: "구술보다 실기가 먼저예요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 실기 특강 다니시는 분 계세요? 효과 어떤지",
    content:
      "실기 준비하는데 특강을 신청할까 고민 중입니다\n\n네이버 블로그에 로맨틱스위밍 코치님\n\n3회 특강 회당 6만원 총 18만원이래요\n\n효과가 있을까요?\n\n혼자 연습하는 것보다 나을지 궁금합니다",
    author: "차량블랙박스녹화각도",
    date: "2026-04-19 20:41:00",
    comments: [
      { author: "대시보드햇빛가리개", content: "특강 효과 사람마다 다르겠지만 피드백이 중요하죠" },
      { author: "와이퍼교체시기확인용", content: "혼자하면 자세 교정이 안 되니까 한두번은 받아볼만 해요" },
      { author: "타이어공기압체크주기", content: "18만원이면 크게 비싸진 않은 것 같아요" },
    ],
  },
  {
    categoryId: 4,
    title: "IM100 물속출발 기준기록 남자 90초 빡세네요",
    content:
      "남자 기준으로\n\n자유 40초 이내\n배영 50초 이내\n평영 40초 이내\n\n90초면 되긴 할 텐데\n\n해수욕장 기록이 떨어지는거 감안하면\n\n실질적으로 빡셉니다",
    author: "캠핑텐트폴수리방법",
    date: "2026-04-20 07:46:00",
    comments: [
      { author: "랜턴배터리잔량확인", content: "25미터 기준이죠? 50미터면 더 힘들텐데" },
      { author: "아이스박스얼음유지력", content: "자유 20초씩이면 40초고 배영 25초씩이면 50초 맞네요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 4년째인데 IM100 90초 쉽지 않습니다",
    content:
      "수영 4년째인데 im100 90초가 쉽지 않다니\n\n저도 3년8개월 4년차인데\n\n나이도 많고 쉽지 않네요\n\n체력이 문제인건지 기술이 문제인건지\n\n매일 차는 방법밖에 없는건가요",
    author: "전동킥보드충전시간",
    date: "2026-04-20 09:24:00",
    comments: [
      { author: "자전거체인윤활유종류", content: "기록 1초 줄이는게 정말 오래 걸리죠 수영은" },
      { author: "헬멧바이저김서림방지", content: "기술이 안 되면 체력으로 커버하기 어려워요" },
      { author: "보조배터리용량계산법", content: "특강 한번 받아보시는것도 방법이에요" },
    ],
  },
  {
    categoryId: 4,
    title: "배영 IM 할때 배빵 나고 안경 벗겨지는데 해결법",
    content:
      "배영에서 자유형으로 전환할 때\n\n배빵 나고 안경 벗겨지고 난리입니다\n\n평영에서 자유형 전환도 숨이 차서\n\n마지막 자유형 5미터는 죽는 기분이에요\n\n연결이 매끄럽질 않습니다",
    author: "블루투스이어폰페어링",
    date: "2026-04-20 08:50:00",
    comments: [
      { author: "무선충전패드호환목록", content: "배영할때 코로 숨 안 들어가게 연습해야 해요" },
      { author: "스마트워치방수등급확인", content: "안경은 끈 달린거 쓰세요 시험장에서도 편해요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 실기 자유형은 크롤이 아니어도 되나요?",
    content:
      "궁금한게 있는데요\n\n자유형 개인종목에서는 어떤 영법이든 자유라고 하는데\n\n실제로 크롤 말고 다른 영법으로 하면\n\n실격 사유가 되는건지 아닌건지\n\n개인혼영에서는 자유형 구간이 앞 세가지 제외 영법이라고 해서요",
    author: "식기세척기세제투입구",
    date: "2026-04-20 15:40:00",
    comments: [
      { author: "전자레인지시간설정법", content: "단일 자유형은 뭘로 해도 됩니다 다만 크롤이 제일 빨라서" },
      { author: "에어프라이어예열시간표", content: "IM에서는 앞 3개 영법 빼고 해야해요 사실상 크롤" },
      { author: "인덕션화력단계비교표", content: "가끔 개구리영으로 하는 사람도 있다던데 느려서 안 하죠" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 실기 스타트는 다이빙인가요 물속출발인가요",
    content:
      "실기 시험 볼 때\n\n스타트가 다이빙인지 물속출발인지\n\n배영은 원래 물속출발이라 알겠는데\n\n자유형이나 평영도 물속에서 시작하나요?\n\n스타트 연습을 해본 적이 없어서 걱정됩니다",
    author: "빔프로젝터초점조절방법",
    date: "2026-04-21 17:22:00",
    comments: [
      { author: "스피커블루투스연결끊김", content: "반포 스타트로 합니다 물속출발 아니에요" },
      { author: "모니터밝기조절단축키설", content: "스타트 연습 가능한 수영장 찾아보세요 많지는 않아요" },
      { author: "키보드키캡교체공구세트", content: "다이빙 못하면 배치기하고 배 벗겨집니다 연습 필수" },
    ],
  },
  {
    categoryId: 4,
    title: "25미터 풀에서 IM100 1분30초 가능할까요",
    content:
      "50미터 레인에서만 훈련하고 있는데\n\nIM200으로 3분10~15초 나옵니다\n\n25미터 레인에서 IM100 치면\n\n1분30초 들어올 수 있을까요?\n\n턴이 더 많으니까 오히려 시간이 더 걸릴 수도 있을까 궁금해요",
    author: "마우스감도DPI조절방법",
    date: "2026-04-21 12:22:00",
    comments: [
      { author: "트랙패드제스처설정가이", content: "50미터에서 3분10초면 25미터에서도 충분히 가능할듯" },
      { author: "외장하드용량포맷방식별", content: "IM200이랑 IM100은 체감이 좀 다르긴 해요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 실기 턴할 때 등 보이면 실격이라고 합니다",
    content:
      "배영에서 자유형 전환할 때\n\n턴에서 등이 보이면 실격이라는데\n\n평영에서 자유형 전환할 때도\n\n등 보이면 안 되는건지\n\n어떤 영법 전환이 실격 사유인지 정리해주실 분",
    author: "에어컨필터교체알림주기",
    date: "2026-04-20 08:50:00",
    comments: [
      { author: "제습기물통용량확인방법", content: "배영 터치 때 등이 보이면 안 되는거예요 터치 순간까지" },
      { author: "공기청정기필터수명계산", content: "사실 심판이 그렇게 꼼꼼하게 안 봐요 시험에서는" },
      { author: "선풍기날개분리세척요령", content: "크게 눈에 띄는 실격 아니면 괜찮을겁니다" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 IM100 훈련법 - 매일 IM 20개씩 차는 사람",
    content:
      "같이 준비하는 친구들이랑\n\n하루에 IM 20개씩 같이 돌았습니다\n\n처음에 2분30초 사이클로 돌다가\n\n10초씩 줄여서 나중엔 1분50초 사이클\n\n한달 동안 매일 만나면서 했더니\n\n다 턱걸이 합격했어요",
    author: "냉장고정수기필터교체",
    date: "2026-04-21 11:47:00",
    comments: [
      { author: "세탁기배수구청소주기표", content: "IM만 2K를 돌다니 대단하십니다" },
      { author: "건조기먼지필터청소방법", content: "결국 많이 하는게 답이긴 하죠" },
      { author: "식기건조대물받이트레이", content: "한달만에 그 정도 줄이셨으면 대단하네요" },
    ],
  },
  {
    categoryId: 4,
    title: "생체 수영 실기 IM200으로 연습하시는 분",
    content:
      "가르치는 선생님이 미친듯이 시키네요\n\n금요일은 IM200으로 하라고\n\n1:1이라 도망도 못 치고\n\n3개만 해도 죽겠는데\n\n15개까지 한 적 있어요\n\n사족보행이 필수입니다 물에서 나오면",
    author: "가스레인지점화불량수리",
    date: "2026-04-21 12:19:00",
    comments: [
      { author: "오븐온도보정방법안내서", content: "IM200 15개면 미쳤다 진짜" },
      { author: "환풍기소음줄이는패드종", content: "근데 그렇게 훈련하면 확실히 체력은 늘겠네요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 배영 턴 연습 어떻게 하세요",
    content:
      "배영에서 자유형 전환할 때\n\n턴이 진짜 어렵습니다\n\n뒤집어지면서 물 먹고\n\n안경 벗겨지고\n\n리듬이 다 깨져요\n\n배영 끝나고 턴하는 팁 있나요",
    author: "스위치커버손때방지필름",
    date: "2026-04-20 08:59:00",
    comments: [
      { author: "콘센트안전캡설치가이드", content: "터치하고 바로 뒤집지 말고 잠깐 멈췄다가 뒤집으세요" },
      { author: "멀티탭과부하방지장치", content: "배영에서 평영으로 넘어갈 때가 제일 어려워요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 구술 경쟁교본 읽는 중인데 양이 장난 아닙니다",
    content:
      "경쟁교본 출력해서 보고있는데\n\n두꺼워서 죽겠어요\n\n이걸 다 볼 수가 없는데\n\n유튜브 보면서 같이 정리하려구요\n\nTTS로 들으면서 보면 좀 낫더라구요",
    author: "스탠드조명각도조절나사",
    date: "2026-04-20 11:19:00",
    comments: [
      { author: "벽걸이시계건전지교체법", content: "경쟁교본이 기본이라 최대한 외우세요" },
      { author: "탁상달력메모공간활용팁", content: "핵심만 뽑아서 말하는 연습이 더 중요해요" },
      { author: "데스크매트미끄럼방지패", content: "구술은 모르겠으면 아는거 최대한 말하세요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영장 레인 대여료가 천차만별이네요",
    content:
      "레인 대여해서 연습하려는데\n\n인천 쪽에 있는 분 계시면\n\n같이 2대1 레슨 하고 싶어요\n\n비용이 천차만별이긴 하네요\n\n개인레슨비가 장난 아닙니다",
    author: "택배박스재활용접는법",
    date: "2026-04-20 08:09:00",
    comments: [
      { author: "우편함잠금장치번호설정", content: "인천이면 바다수영하시는 분들이랑 같이 해도 좋을듯" },
      { author: "현관문도어벨볼륨조절법", content: "레슨비 아끼려면 2대1이 확실히 낫죠" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 인원 요즘 미친듯이 늘었다는데 체감됩니다",
    content:
      "생활체육 인원이 폭발적으로 증가해서\n\n필기가 쉬우면 실기 장소가 부족해지고\n\n실기가 쉬우면 연수원이 부족해지고\n\n시험 난이도가 상승하는게 현실이라고 합니다\n\n경제적으로 감당이 안 되는 진흥공단에서는\n\n어쩔 수 없이 난이도를 올린다고",
    author: "전등스위치높이조절기준",
    date: "2026-04-20 18:10:00",
    comments: [
      { author: "형광등안정기교체안내서", content: "실기장 부족 문제는 진짜 심각하죠" },
      { author: "LED전구색온도선택가이드", content: "올해 필기 난이도가 확 올랐던 이유가 이거였군요" },
      { author: "센서등감지범위조절다이얼", content: "내년에는 좀 나아지려나 모르겠네요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 생체 실기 고사장은 언제 공개되나요",
    content:
      "5월 18일 접수인데\n\n고사장은 언제 공개되는지 아시는 분\n\n작년에는 어디서 봤는지\n\n올해도 비슷하겠죠?\n\n접수하기 전에 고사장 위치 알고 싶은데",
    author: "주차장정산기카드투입방향",
    date: "2026-04-22 15:55:00",
    comments: [
      { author: "차량번호인식카메라각도", content: "실기 등록할 때쯤 나올거예요" },
      { author: "주차요금할인시간계산법", content: "작년에는 지역별로 다르게 공지됐어요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 생체 실기 기간이 5월26일~7월10일이래요",
    content:
      "실기 기간이 5월 26일부터 7월 10일까지인데\n\n날짜 선택이 가능한거 아니고\n\n날짜별로 지역이 다르다고 합니다\n\n뒤로 갈수록 지방일 확률이 높아지는 경향이래요\n\n수도권이면 빨리 접수해야 할 듯",
    author: "지하철노선도확대축소법",
    date: "2026-04-20 15:20:00",
    comments: [
      { author: "교통카드잔액확인어플명", content: "서울이면 6월 초에 잡히지 않을까요" },
      { author: "버스정류장도착알림설정법", content: "지방 가야되면 1박2일 코스네요" },
      { author: "기차좌석등급별요금비교", content: "작년에 창원까지 간 사람도 있다던데" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 수구사 2급이 뭔가요? 라이프가드랑 다른건가요",
    content:
      "수영장 취업하려면\n\n수구사 2급이 필요하다는데\n\n그게 라이프가드랑 같은건가요?\n\n생체 수영이랑 수구사 둘 다 있어야 하나요?\n\n수구사가 수영장 가르치는거랑 무슨 상관인지",
    author: "배수구거름망교체사이즈",
    date: "2026-04-20 22:51:00",
    comments: [
      { author: "수도꼭지필터교체주기표", content: "라이프가드가 수구사 2급으로 바뀐거예요" },
      { author: "샤워기헤드수압조절방법", content: "수영장 근무하려면 수구사가 있어야 해요" },
      { author: "욕실거울김서림방지코팅", content: "생체랑 수구사 둘 다 있으면 취업에 유리하죠" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 강사 처우가 너무 안 좋다는데 진짜인가요",
    content:
      "수영 강사로 일하면\n\n레슨당 22000~25000원이래요\n\n갈 때마다 수영복 갈아입는것도 고역이고\n\n차라리 수영만 하고 싶다는 분들 많더라구요\n\n자격증 따고 나서 처우가 이렇다니",
    author: "실내온도계벽걸이설치법",
    date: "2026-04-20 17:02:00",
    comments: [
      { author: "습도계건전지교체시기안내", content: "공립 수영장은 가격을 못 올려서 그래요" },
      { author: "바닥난방온도조절패널위치", content: "사립이면 좀 낫겠지만 공공기관은 힘들죠" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 IM 기록 측정 팁 - 페이스 비프음 활용",
    content:
      "장수용 시계 없으시면\n\n음악 파일 만들어서 들으세요\n\n1분30초마다 비프음 나오게 하면\n\n내가 브레이크아웃 하는 시간\n\n턴하는 시간 체크 가능합니다\n\n유튜브에도 페이스 타이머 있어요",
    author: "보일러배관동파방지히터",
    date: "2026-04-21 17:55:00",
    comments: [
      { author: "난방비절약온도설정가이드", content: "장수용 시계가 제일 편하긴 한데 비싸죠" },
      { author: "온수기온도조절다이얼위치", content: "유튜브 페이스 타이머 좋은 팁이네요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 IM100 반포스타트로 2초 줄었습니다",
    content:
      "물속출발로만 연습하다가\n\n반포스타트 처음 해봤는데\n\n확실히 2초 정도 줄어요\n\n다만 바닥 얕으면 무서워요\n\n배치기 당할 수 있으니까\n\n스타트 연습은 필수입니다",
    author: "가습기물통세척베이킹소다",
    date: "2026-04-22 14:29:00",
    comments: [
      { author: "공기순환기필터교체방법", content: "스타트로 2초면 크죠 꼭 연습하세요" },
      { author: "제습기연속배수호스연결", content: "배치기 진짜 아프니까 수심 확인 필수" },
      { author: "창문단열필름부착요령안내", content: "깊은 풀에서 연습하는게 안전해요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 실기에서 배영 해턴 종류가 궁금합니다",
    content:
      "배영 턴 종류가\n\n롤오버 오픈턴 크로스오버턴\n\n3가지 턴이 있다고 하는데\n\n시험에서는 어떤걸로 해야 하나요?\n\n다 해도 되는건가요?",
    author: "양문형냉장고문짝수평조절",
    date: "2026-04-20 16:24:00",
    comments: [
      { author: "김치냉장고온도설정가이드", content: "3가지 다 할 줄 알면 좋은데 롤오버가 기본이에요" },
      { author: "냉동고성에제거방법안내서", content: "시험에서는 뭘로 하든 상관없어요 규정만 안 어기면" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 접수 5월18일인데 장소 모른다는게 불안합니다",
    content:
      "실기 접수가 5월 18일 시작이고\n\n고사장 공고도 아직이라\n\n어디서 시험 볼지 모르는 상태로\n\n접수해야 하네요\n\n근처에서 보면 좋겠는데\n\n지방으로 내려가야 할 수도 있다니",
    author: "주방후드필터기름때세척",
    date: "2026-04-22 15:06:00",
    comments: [
      { author: "싱크대배수구막힘뚫는법", content: "고사장 나오면 빨리 움직여야 해요 인기 지역은 금방 참" },
      { author: "수전교체셀프시공가이드", content: "창원 성산 쪽이 자주 나오더라구요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 안 한 기간 9개월인데 IM100 도전합니다",
    content:
      "수영 경력이 9개월이고\n\n개인레슨 받으면서 준비하려구요\n\n터무니없을 수 있는데\n\n올해 안에 기록 만들어보겠습니다\n\n같은 인천 분 계시면 2대1 레슨 같이 해요",
    author: "정수기필터교환일자관리",
    date: "2026-04-20 08:03:00",
    comments: [
      { author: "커피머신석회질제거방법", content: "9개월이면 기본은 되실텐데 IM은 빡세요 화이팅" },
      { author: "텀블러고무패킹교체방법", content: "레슨 꾸준히 받으면 충분히 가능해요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 실기 IM100 여자 1분48초에서 1분40초로 줄인 후기",
    content:
      "2개월 만에 1분48초에서 1분40초 만들었어요\n\n물속스타트로 48이었는데\n\n반포스타트로 40 나왔습니다\n\n배영이 제일 약해서 집중 연습했구요\n\n하루 IM 4세트 3~5번 반복했어요\n\n다들 할 수 있습니다",
    author: "뚜껑분리수거올바른방법",
    date: "2026-04-22 14:15:00",
    comments: [
      { author: "재활용날짜지역별확인법", content: "2개월에 8초면 대단하네요 비결이 뭔가요" },
      { author: "음식물쓰레기봉투묶는법", content: "반포스타트 효과가 확실히 크긴 하죠" },
      { author: "분리수거스티커부착위치", content: "IM 4세트면 400미터 꽤 빡센데 대단하십니다" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 자유형 25미터 몇 초 나와야 IM 합격권인가요",
    content:
      "자유형 기준으로\n\n25미터 몇 초 나와야\n\nIM100 합격이 가능한건가요\n\n여자 기준으로 22초?\n\n근데 연결하면 더 느려지잖아요\n\n각 영법별 목표 시간이 궁금합니다",
    author: "도어스토퍼바닥고정나사",
    date: "2026-04-20 08:54:00",
    comments: [
      { author: "경첩윤활유종류별효과비교", content: "여자 기준 자유 22 배영 26 평영 24 정도면 될듯" },
      { author: "잠금장치도어체인설치법", content: "단일로 재는거랑 연결해서 재는거 차이 크니까 5초는 더 봐야해요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 개인혼영 체력분배가 진짜 핵심입니다",
    content:
      "처음에 빨리 가려고 하면 안 됩니다\n\n특히 접영부터 빨리 가면\n\n배영에서 이미 지쳐요\n\n일정한 리듬으로 가야 합니다\n\n마지막 자유형에서 스퍼트 하는게 맞아요\n\n페이스 조절 연습을 꼭 하세요",
    author: "방충망교체메쉬규격확인",
    date: "2026-04-20 09:02:00",
    comments: [
      { author: "창틀실리콘보수시기안내", content: "접영에서 체력 다 쓰면 배영부터 죽는건 진짜" },
      { author: "블라인드줄꼬임풀기방법", content: "저도 처음에 접영에서 전력질주하다가 IM 기록 안 나왔어요" },
      { author: "커튼레일브라켓설치간격", content: "dps로 천천히 가는게 오히려 빨라요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 생체 실기 깊은 물에서 보면 IM 기록 떨어지나요",
    content:
      "평소에 얕은 수영장에서 연습하다가\n\n시험장이 깊은 곳이면\n\n기록이 좀 떨어질까요?\n\n턴할 때 벽 차는 느낌이 다를 것 같은데\n\n미리 깊은 곳에서 연습해야 하나",
    author: "화장실타일줄눈곰팡이제",
    date: "2026-04-20 12:45:00",
    comments: [
      { author: "세면대배수속도느릴때점", content: "깊이가 깊으면 턴할 때 벽 차기 감이 좀 달라요" },
      { author: "변기물내림버튼눌림불량", content: "50미터 풀이면 확실히 분위기가 다르긴 해요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 IM 기록 2분4초에서 8회 특강 받고 합격한 후기",
    content:
      "처음 2분4초 나왔는데\n\n8회 특강 받고 합격했어요\n\n8초 정도는 충분히 줄일 수 있는 기간이래요\n\n글라이딩 잘하면 4번째 이후부터\n\n스트록 수가 확 줄어서\n\n체력 아끼면서 갈 수 있다고 합니다",
    author: "자동차앞유리워셔액보충",
    date: "2026-04-21 16:40:00",
    comments: [
      { author: "사이드미러접힘각도조절", content: "8초 줄인게 대단해요 특강 효과가 좋았나보네요" },
      { author: "뒷유리열선작동확인방법", content: "글라이딩이 진짜 핵심이죠 몸이 펴져있기만 해도 빨라요" },
      { author: "에어컨냉매충전시기확인법", content: "본인 노력도 대단하신거예요 8회만에 합격이라니" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 생체 자격증 따면 갱신이 필요한가요",
    content:
      "수구사는 3년에 한번 갱신이라는데\n\n생체 수영도 갱신이 있나요?\n\n한번 따면 영구적인건가요?\n\n보수교육 같은거 받아야 하나\n\n궁금합니다",
    author: "차량등록증재발급절차안내",
    date: "2026-04-21 09:11:00",
    comments: [
      { author: "면허증갱신온라인신청방법", content: "스포츠지도사는 연수 이수하면 됩니다 갱신은 따로 없어요" },
      { author: "여권유효기간확인사이트", content: "수구사는 3년마다 보수교육 받아야 해요" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 반포스타트 배치기 당해봤는데 진짜 아프네요",
    content:
      "스타트 연습하다가\n\n배치기 제대로 당했습니다\n\n처음이라 그런지\n\n배에서 쩡 하는 느낌이\n\n3시간 동안 안 사라졌어요\n\n깊은 곳에서 해야 안전합니다",
    author: "무선마우스수신기분실시대",
    date: "2026-04-21 12:36:00",
    comments: [
      { author: "키보드청소브러시사이즈별", content: "배치기 진짜 아프죠 저도 처음에 고생했어요" },
      { author: "마우스패드세탁가능여부확", content: "입수 각도 연습이 중요해요 너무 수평으로 들어가면 안돼" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 실기 준비하면서 살도 빠지네요",
    content:
      "IM 훈련하면서\n\n살이 쫙 빠지네요\n\n체중감량 효과까지 있을 줄은\n\n매일 IM 여러개 치니까\n\n밥 먹어도 살이 안 찌는 느낌\n\n자격증 준비가 다이어트가 되었습니다",
    author: "체중계배터리교체리튬종류",
    date: "2026-04-22 11:20:00",
    comments: [
      { author: "인바디측정주기추천안내서", content: "수영이 칼로리 소모 많긴 하죠" },
      { author: "체지방률목표설정계산법", content: "근데 너무 빠지면 부력이 줄어서 오히려 기록 떨어질 수도" },
    ],
  },
  {
    categoryId: 4,
    title: "수영 생체 연수 90시간 주말만 가능한데 되나요",
    content:
      "연수가 90시간이라는데\n\n주중에 직장 다니면서\n\n주말에만 나갈 수 있는데\n\n주중 주말 주일주말 이렇게\n\n선택해서 할 수 있다고 들었어요\n\n실기 합격하면 바로 신청해야겠죠",
    author: "출퇴근교통비정산어플",
    date: "2026-04-21 15:05:00",
    comments: [
      { author: "월급날자동이체설정방법", content: "주말반도 있으니까 걱정마세요" },
      { author: "연차사용기준잔여일수확인", content: "연수 등록 빨리 해야 해요 자리 금방 차요" },
    ],
  },
];

const posts: PostData[] = [...existingPosts, ...newPosts];

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

  for (const post of newPosts) {
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
