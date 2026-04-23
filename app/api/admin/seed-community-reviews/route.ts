import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

import { REGION_GROUPS } from "@/app/lib/region-data";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const weightedRegionCodes = [
  "SEOUL","SEOUL","SEOUL","SEOUL","SEOUL",
  "GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI",
  "BUSAN","BUSAN","BUSAN","INCHEON","INCHEON","INCHEON",
  "DAEGU","DAEGU","DAEJEON","DAEJEON","GWANGJU","GWANGJU",
  "GYEONGNAM","GYEONGNAM","GYEONGBUK","GYEONGBUK",
  "CHUNGNAM","CHUNGNAM","JEONNAM","JEONBUK","CHUNGBUK","GANGWON","ULSAN","SEJONG","JEJU",
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
  // ===== 21차 시드: 생체/장체/노인/유소년 혼합 오픈채팅 (2026-04-19~22) =====
  {categoryId:1,title:"장체 특별 가채점 75점인데 미묘하네요",content:"자신만만하게 봤는데 가채점 해보니 75점이네요\n\n5개 틀린 건 좀 억울한데 그래도 합격선은 넘겼으니 다행이라고 해야 하나\n\n혹시 장체 특별 보신 분들 가채점 어떻게 나오셨나요\n\n체육사 문제가 좀 애매했던 거 같은데",author:"전자레인지",date:"2026-04-19 14:22:00",comments:[{author:"볼펜꽂이",content:"저도 장체 특별 75점이에요 체육사 진짜 애매했음"},{author:"빨래건조대",content:"75면 합격 아닌가요? 축하드려요"},{author:"유리컵세트",content:"저는 70점 겨우 넘겼네요 ㅠㅠ 가채점이라 불안합니다"}]},
  {categoryId:4,title:"수영 실기 IM100 크로스오버턴 절대 하지 마세요",content:"장체 수영 구술에서 DQ 엄격하게 본다고 들었는데 실기도 마찬가지입니다\n\n크로스오버턴 하면 바로 DQ 먹어요\n\n배영에서 자유형으로 넘어갈 때 그냥 오픈턴 하세요\n\n괜히 멋부리다 실격당하면 1년 날립니다",author:"형광마커",date:"2026-04-19 15:40:00",comments:[{author:"스테이플러",content:"이거 진짜 중요한 정보네요 감사합니다"},{author:"탁상달력",content:"작년에 크로스오버턴으로 DQ 먹은 사람 봤어요 진짜 조심해야 합니다"},{author:"접이식우산",content:"오픈턴이 시간 좀 더 걸려도 안전하죠"},{author:"종이클립",content:"배영턴도 등 대고 벽 터치 안 하면 DQ라 긴장됨"}]},
  {categoryId:1,title:"실기구술 자료 구하기 진짜 힘드네요",content:"역도 실기구술 준비하려고 하는데 자료가 하나도 없어요\n\n비인기 종목은 기출도 없고 후기도 없고\n\n혹시 역도나 비인기 종목 실기구술 보신 분 계시면 팁 좀 부탁드립니다\n\n인터넷 다 뒤져봐도 수영 태권도 이런 것만 나와요",author:"멀티탭",date:"2026-04-19 16:15:00",comments:[{author:"도마칼",content:"비인기종목은 진짜 자료가 없어서 직접 체육회 가서 물어보는 게 빠름"},{author:"고무장갑",content:"역도는 대한역도연맹 교재 참고하시는 게 낫습니다"},{author:"빗자루걸이",content:"저도 합기도인데 자료 없어서 고생 중이에요 ㅠ"}]},
  {categoryId:4,title:"수영 구술 문제 3문제인가요 4문제인가요",content:"구술 준비하는데 어떤 분은 3문제라 하고 어떤 분은 4문제라 하고\n\n작년 보신 분들 정확히 몇 문제 나왔는지 알려주실 수 있나요\n\n준비 범위가 달라져서 확인하고 싶습니다",author:"손톱깎이",date:"2026-04-19 17:30:00",comments:[{author:"치약홀더",content:"작년에 3문제 나왔어요 시간은 한 문제당 3분 정도"},{author:"이어폰줄감개",content:"저는 4문제 받았는데요? 지역마다 다른 건가"},{author:"수건걸이",content:"공식적으로는 3~4문제인데 심사위원 재량이라고 알고 있습니다"},{author:"휴지케이스",content:"보통 3문제고 추가질문 들어오면 4문제처럼 되는 거예요"}]},
  {categoryId:1,title:"이의신청 하신 분 계세요? 사회학 8번",content:"사회학 8번 답이 좀 이상하지 않나요\n\n여러 블로그 보니까 복수정답 가능성도 있다는 글이 있던데\n\n이의신청 기간 안에 넣으려면 근거자료 준비해야 하는 거죠?\n\n같이 이의신청 하실 분 있으면 근거 공유합시다",author:"책갈피",date:"2026-04-19 18:45:00",comments:[{author:"메모꽂이",content:"저도 그 문제 이상했어요 교재마다 답이 다름"},{author:"우편함",content:"이의신청은 근거자료 첨부하면 반영률 높아진다고 합니다"},{author:"방향제",content:"작년에도 사회학에서 복수정답 나왔었죠"}]},
  {categoryId:4,title:"수영 IM100 물속출발 vs 반포스타트 2초 차이",content:"물속출발이랑 반포스타트 차이가 대략 2초 정도 난다고 하더라고요\n\n저는 아직 반포스타트가 무서워서 물속출발만 하는데\n\n기준기록 빡빡한 분들은 반포스타트 연습 꼭 하세요\n\n2초면 합불 갈리는 시간입니다",author:"건전지함",date:"2026-04-19 20:10:00",comments:[{author:"거울닦이",content:"반포스타트 연습하다가 배치기 당한 적 있어요 ㅋㅋ 아팠음"},{author:"식탁보",content:"반포스타트 제대로 못 하면 오히려 더 느려요 충분히 연습하고 하세요"},{author:"열쇠고리",content:"2초면 엄청 큰 차이네요 연습해야겠다"}]},
  {categoryId:4,title:"장수용 시계 710 사신 분 후기 궁금합니다",content:"실기 준비하면서 장수용 시계 살까 고민 중인데\n\n710 모델 쓰시는 분들 실제로 도움이 되나요\n\nMP3 기능으로 2분 루프 만들어서 페이스 맞춘다는 글을 봤는데\n\n가격이 좀 해서 고민됩니다",author:"알람시계",date:"2026-04-19 21:30:00",comments:[{author:"주방세제",content:"710 쓰고 있는데 MP3 2분루프 진짜 좋아요 페이스 잡기 딱임"},{author:"면봉통",content:"저는 벽시계 보면서 했는데 시계 사니까 확실히 편하더라고요"},{author:"칫솔꽂이",content:"가성비 좋습니다 실기 끝나고도 수영할 때 계속 써요"}]},
  {categoryId:5,title:"배드민턴 실기 서비스 넣는 연습 팁",content:"실기 준비하면서 서비스 연습 중인데 자꾸 네트에 걸리네요\n\n숏서비스가 안정적으로 안 들어가서 스트레스받아요\n\n혹시 연습 방법 있으면 알려주세요\n\n하루에 몇 개씩 하시나요",author:"샤워커튼",date:"2026-04-20 09:15:00",comments:[{author:"선풍기커버",content:"셔틀콕 50개 놓고 연속으로 쏘는 거 매일 하세요 감 잡힙니다"},{author:"바구니",content:"손목 스냅 최소화하고 밀어치는 느낌으로 하면 안정적이에요"},{author:"테이프커터",content:"롱서비스도 섞어서 연습하세요 실기 때 둘 다 봅니다"}]},
  {categoryId:4,title:"장체 IM200 기준기록이랑 생체 IM100 기준 차이",content:"장체 수영은 IM200 기준기록이 2분 5초라고 하던데 맞나요\n\n생체는 IM100 1분 30초에서 40초 사이라고 하고\n\n장체가 거리 길어서 여유 있을 줄 알았는데 기준이 또 다르네요\n\n두 개 다 준비하시는 분 계신가요",author:"목재선반",date:"2026-04-20 10:30:00",comments:[{author:"유리병",content:"장체 2분5초 맞아요 근데 200은 체력 안배가 중요합니다"},{author:"서류봉투",content:"생체 IM100 작년 기준 1분35초였어요 매년 조금씩 바뀜"},{author:"방석커버",content:"둘 다 준비하는 건 무리예요 하나만 집중하세요"},{author:"도시락통",content:"장체 200은 배영 구간에서 시간 많이 잡아먹어요 배영 연습 많이 하세요"}]},
  {categoryId:2,title:"축구 실기 리프팅 몇 개 해야 하나요",content:"축구 실기 준비하는데 리프팅 기준이 어떻게 되는지 모르겠어요\n\n30개 넘기면 만점이라는 말도 있고 50개라는 말도 있고\n\n그리고 발등만 가능한가요 허벅지도 되나요",author:"행주걸이",date:"2026-04-20 11:00:00",comments:[{author:"냄비받침",content:"발등 리프팅 기준이고 작년엔 30개면 감점 없었어요"},{author:"수저통",content:"허벅지 섞어도 됩니다 근데 발등 위주로 하는 게 점수 좋아요"},{author:"창문닦이",content:"50개 이상 하면 확실히 만점이에요 여유 있게 연습하세요"}]},
  {categoryId:1,title:"필기 체육사 문제 난이도 논란",content:"이번 필기 체육사 문제 너무 어렵지 않았나요\n\n교재에 안 나오는 내용도 있었고 지엽적인 문제가 많았어요\n\n체육사 한 과목 때문에 과락 나올 뻔했습니다\n\n이의신청 복수정답 나오면 좀 살 거 같은데",author:"종이컵홀더",date:"2026-04-20 12:20:00",comments:[{author:"수도꼭지",content:"체육사 올해 특히 어려웠죠 교재 3권 봤는데도 모르는 거 나옴"},{author:"액자걸이",content:"복수정답 나올 만한 문제 2개는 있다고 봅니다"},{author:"테이블매트",content:"과락만 안 나오면 다행이라 생각하고 있어요 ㅠ"},{author:"밀폐용기",content:"체육사 기출 10년치 봐도 올해 수준은 처음인 듯"}]},
  {categoryId:4,title:"수영 실기 스타트 연습하다 배치기 당한 후기",content:"오늘 반포스타트 연습하다가 배치기 제대로 당했습니다\n\n입수 각도가 너무 낮았나봐요 배가 빨개졌어요\n\n스타트대 높이가 수영장마다 달라서 적응이 안 되네요\n\n다들 처음에 이런가요",author:"양념통",date:"2026-04-20 13:50:00",comments:[{author:"걸레통",content:"ㅋㅋㅋ 다들 한번씩은 겪어요 입수 각도 45도 유지하세요"},{author:"비누받침",content:"처음엔 낮은 스타트대에서 연습하고 점점 높이 올리세요"},{author:"옷걸이",content:"배치기 무서우면 수중 스타트부터 하는 것도 방법입니다"}]},
  {categoryId:5,title:"배드민턴 구술 어떤 문제 나오나요",content:"배드민턴 구술 준비 중인데 기출이 별로 없어서요\n\n규칙 관련 문제가 주로 나오나요 아니면 기술 분석도 나오나요\n\n지도법 관련해서도 준비해야 할까요\n\n작년에 보신 분들 알려주시면 감사하겠습니다",author:"보온병",date:"2026-04-20 14:30:00",comments:[{author:"돋보기",content:"규칙 + 기술분석 + 지도법 골고루 나와요 3문제 중 하나씩"},{author:"쪽집게",content:"서비스 관련 규칙 변경된 거 꼭 숙지하세요 작년 나왔어요"},{author:"손잡이",content:"지도법은 초보자 대상 레슨 시나리오로 물어봐요"},{author:"빗",content:"BWF 규칙 변경사항 정리해 가면 도움 됩니다"}]},
  {categoryId:3,title:"태권도 실기 품새 어떤 거 해야 하나요",content:"태권도 실기 품새가 고려 1장부터인가요\n\n아니면 태극 품새도 포함인지 궁금합니다\n\n당일 랜덤으로 지정하나요 아니면 미리 알려주나요",author:"거품기",date:"2026-04-20 16:00:00",comments:[{author:"국자",content:"태극 1~8장 + 고려까지 범위예요 당일 지정합니다"},{author:"냉장고자석",content:"작년에는 태극 4장이랑 고려 나왔어요"},{author:"고무줄",content:"품새 정확도랑 기합 크기도 점수에 반영돼요 소리 크게 내세요"}]},
  {categoryId:4,title:"수영 배영턴 연습 방법 공유",content:"배영에서 접영으로 넘어갈 때 턴이 자꾸 불안해요\n\n등으로 벽 터치하고 돌아야 하는데 거리 감이 안 잡힘\n\n깃발 보고 맞추라는데 수영장마다 깃발 위치가 다르잖아요\n\n연습 방법 있으면 알려주세요",author:"주걱",date:"2026-04-20 17:20:00",comments:[{author:"도마",content:"깃발에서 스트로크 3번이면 벽이에요 본인 스트로크 수 세는 연습하세요"},{author:"밀대",content:"등 터치 안 하면 바로 DQ니까 확실하게 터치하고 돌으세요"},{author:"수세미",content:"배영턴 영상 유튜브에 많아요 참고하세요"},{author:"행거",content:"처음엔 천천히 벽까지 가서 거리감 익히는 게 먼저예요"}]},
  {categoryId:1,title:"노인스포츠지도사 구술 자료 어디서 구하나요",content:"노인스포츠지도사 구술 자료가 진짜 없네요\n\n생체는 자료가 좀 있는데 노인은 기출도 없고 후기도 없고\n\n노인체육론 교재만 달달 외워야 하나요\n\n준비하시는 분들 어떻게 하고 계신가요",author:"젓가락통",date:"2026-04-20 19:00:00",comments:[{author:"뚜껑",content:"노인체육론 교재 + 국민체육진흥공단 자료 참고하세요"},{author:"채반",content:"저도 자료 없어서 생체 구술 자료 베이스로 노인 특성 추가해서 정리했어요"},{author:"국그릇",content:"노인 낙상예방, 치매예방 운동프로그램 쪽으로 나올 확률 높아요"}]},
  {categoryId:5,title:"배드민턴 실기 클리어 높이 기준 있나요",content:"배드민턴 실기에서 클리어 칠 때 높이 기준이 있는지 궁금해요\n\n하이클리어가 천장에 닿을 정도로 높아야 하나요\n\n아니면 적당히 백라인까지 보내면 되는 건지\n\n점수 기준을 모르겠어요",author:"과일칼",date:"2026-04-20 20:15:00",comments:[{author:"접시",content:"백라인 안쪽으로 떨어지면 감점이에요 확실하게 뒤로 보내세요"},{author:"냄비뚜껑",content:"높이보다 거리가 중요합니다 엔드라인 근처가 만점"},{author:"뒤집개",content:"하이클리어 드리븐클리어 둘 다 섞어서 하면 가산점 있다고 들었어요"}]},
  {categoryId:4,title:"수구사 2급 특록 전환 해보신 분",content:"수구사 2급 자격증 가지고 있는데 특록 전환이 가능하다고 들었어요\n\n전환 절차가 어떻게 되는지 아시는 분 계신가요\n\n서류 준비할 게 많은지 궁금합니다",author:"문고리",date:"2026-04-21 09:30:00",comments:[{author:"자물쇠",content:"체육회 가서 전환 신청서 내면 됩니다 경력증명서 필요해요"},{author:"바늘꽂이",content:"특록 전환하면 연수는 면제되나요?"},{author:"실타래",content:"면제 안 됩니다 연수 90시간은 별도로 이수해야 해요"}]},
  {categoryId:1,title:"연수 90시간 어떻게 채우셨나요",content:"합격하고 나면 연수 90시간 이수해야 하잖아요\n\n직장 다니면서 어떻게 채우셨는지 궁금합니다\n\n온라인으로 가능한 시간이 있나요 아니면 전부 오프라인인가요\n\n보수교육이랑은 다른 거죠?",author:"물뿌리개",date:"2026-04-21 10:45:00",comments:[{author:"장바구니",content:"온라인 40시간 오프라인 50시간이에요 연차 써서 다녀왔습니다"},{author:"돗자리",content:"보수교육은 자격 취득 후 매년 받는 거고 연수는 최초 1회예요"},{author:"에코백",content:"오프라인 연수 기간에 실습도 포함이라 체력적으로 좀 힘들어요"},{author:"파우치",content:"직장인은 여름 집중과정 추천이요 2주 안에 끝낼 수 있어요"}]},
  {categoryId:4,title:"수영강사 처우가 이 정도인가요",content:"수영 지도사 자격 따고 취업 알아보는데 처우가 생각보다 안 좋네요\n\n시급제가 대부분이고 월급제라도 200 초반이라\n\n자격증 따는 노력 대비 보상이 너무 적은 거 아닌가 싶어요\n\n현직 계신 분들 실제 어떠신가요",author:"비닐봉투",date:"2026-04-21 11:30:00",comments:[{author:"지퍼백",content:"공공수영장 기준 시급 2만원 전후예요 레슨 많이 잡으면 괜찮긴 한데"},{author:"행거집게",content:"구청 스포츠센터가 처우 제일 나아요 4대보험 됩니다"},{author:"옷핀",content:"프리랜서로 개인레슨 하면 수입 괜찮은데 불안정하죠"}]},
  {categoryId:2,title:"축구 구술 전술 관련 질문 나오나요",content:"축구 구술 준비 중인데 전술 관련 질문이 나오는지 궁금합니다\n\n4-3-3이나 3-5-2 같은 포메이션 설명을 준비해야 하나요\n\n아니면 기본기 지도법 위주인가요",author:"싱크대",date:"2026-04-21 13:00:00",comments:[{author:"수납장",content:"전술보다 기본기 지도법 위주로 나와요 드리블 패스 슈팅 지도 순서"},{author:"서랍장",content:"작년에 유소년 대상 훈련 프로그램 짜는 문제 나왔어요"},{author:"신발장",content:"룰 관련도 가끔 나오니까 오프사이드 VAR 이런 거 정리해 가세요"}]},
  {categoryId:7,title:"배구 실기 서브 몇 개 넣어야 만점인가요",content:"배구 실기 서브 넣는 게 있잖아요\n\n10개 중 몇 개 넣어야 만점인지 아시는 분\n\n오버핸드 서브만 하면 되나요 점프서브도 해야 하나요",author:"빨래판",date:"2026-04-21 14:30:00",comments:[{author:"빨래집게",content:"10개 중 8개 이상이면 만점이에요 오버핸드만 해도 됩니다"},{author:"세탁망",content:"점프서브 하면 가산점 있다는 말도 있는데 확실하진 않아요"},{author:"섬유유연제",content:"코트 구역별로 넣는 거라 정확도가 중요합니다"}]},
  {categoryId:4,title:"수영 자유형 50m 기록 단축 방법",content:"자유형 50m가 40초에서 안 줄어요\n\n턴이랑 스타트 빼면 순수 수영 속도가 너무 느린 건지\n\n킥을 더 많이 차야 하나요 아니면 스트로크를 길게 해야 하나요\n\n35초 벽을 못 넘겠습니다",author:"계량컵",date:"2026-04-21 15:45:00",comments:[{author:"믹서기",content:"캐치 구간을 확실하게 잡으세요 팔꿈치 높이 유지하고 당기는 게 핵심"},{author:"도마판",content:"킥은 6비트로 가되 무릎 안 구부리게 주의하세요"},{author:"체",content:"35초 벽은 스타트+턴에서 1~2초 줄이는 게 제일 빨라요"},{author:"주전자",content:"호흡 횟수 줄이면 바로 1초 빠져요 25m 1번 호흡 연습하세요"}]},
  {categoryId:1,title:"장애인스포츠지도사 구술 자료 공유합니다",content:"장애인스포츠지도사 구술 준비하면서 정리한 자료 공유해요\n\n장애유형별 운동프로그램 + 안전관리 + 지도 시 유의사항 위주로 정리했어요\n\n기출 기반은 아니고 교재 정리본이라 참고만 하세요\n\n필요하신 분 댓글 달아주시면 공유드릴게요",author:"포스트잇",date:"2026-04-21 17:00:00",comments:[{author:"인덱스탭",content:"와 감사합니다 장체 자료 진짜 없어서 고생 중이었어요"},{author:"바인더",content:"저도 부탁드립니다 메일 보내도 될까요"},{author:"클립보드",content:"혹시 시각장애 파트도 포함되어 있나요?"},{author:"파일철",content:"자료 공유 감사드립니다 같이 합격합시다!"}]},
  {categoryId:5,title:"배드민턴 스매시 스피드 기준이 있나요",content:"실기에서 스매시 스피드를 재나요\n\n스피드건으로 측정하는 건 아니겠지만 혹시 기준이 있는지\n\n스매시보다 정확도가 중요한 건지 궁금합니다",author:"다리미",date:"2026-04-21 18:20:00",comments:[{author:"다리미판",content:"스피드 측정은 안 해요 정확도가 훨씬 중요합니다"},{author:"분무기",content:"코스 정확도 + 폼 점수예요 대각선으로 정확하게 꽂으세요"},{author:"솔",content:"점프스매시 할 수 있으면 하세요 폼 점수 높게 나옴"}]},
  {categoryId:15,title:"육상 실기 종목 선택 뭐가 유리한가요",content:"육상 실기 종목 선택에서 고민 중입니다\n\n100m랑 1500m 중에 뭐가 더 유리할까요\n\n기준기록 대비 체감 난이도가 어떤지 궁금해요",author:"운동화끈",date:"2026-04-21 19:30:00",comments:[{author:"깔창",content:"100m가 기준 널널해서 유리하다고 합니다"},{author:"스포츠타올",content:"장거리 자신 있으면 1500m도 괜찮아요 경쟁이 덜해서"},{author:"아령",content:"필드 종목도 고려해보세요 포환던지기 같은 거"}]},
  {categoryId:3,title:"태권도 겨루기 실기 보호구 개인 지참인가요",content:"태권도 실기 겨루기 볼 때 보호구를 개인이 가져가야 하나요\n\n아니면 시험장에서 제공하나요\n\n헤드기어 몸통보호대 전부 필요한 건지",author:"후라이팬",date:"2026-04-22 09:00:00",comments:[{author:"냄비손잡이",content:"개인 지참이에요 헤드기어 몸통 팔다리보호대 전부 가져가세요"},{author:"석쇠",content:"시험장에 여분 있긴 한데 사이즈 안 맞으면 곤란해요"},{author:"국자걸이",content:"발등보호대도 잊지 마세요 없으면 출전 불가에요"}]},
  {categoryId:4,title:"장체 수영 구술 DQ 관련 질문 정리",content:"장체 수영 구술에서 DQ 관련 질문이 자주 나온다고 합니다\n\n실격 사유별로 정리해서 공부하는 게 좋겠어요\n\n크로스오버턴 양손터치 미스 이조기 출발 등\n\n혹시 다른 DQ 사유 아시는 분 추가해주세요",author:"대걸레",date:"2026-04-22 10:15:00",comments:[{author:"먼지털이",content:"접영에서 한손터치 하면 DQ 이것도 추가해주세요"},{author:"쓰레받기",content:"배영 출발 시 발가락 홈통 위로 올리면 DQ 이것도요"},{author:"걸레짤순이",content:"평영 킥에서 돌핀킥 하면 DQ입니다"},{author:"청소포",content:"정리 감사합니다 이거 프린트해서 가져갈게요"}]},
  {categoryId:1,title:"보수교육 매년 받아야 하나요",content:"자격증 취득 후에 보수교육을 매년 받아야 한다고 들었는데\n\n안 받으면 자격 취소되나요\n\n온라인으로 가능한지 오프라인만 되는지 궁금합니다",author:"벽걸이",date:"2026-04-22 11:00:00",comments:[{author:"못",content:"매년은 아니고 2년에 1번이에요 온라인도 일부 가능합니다"},{author:"나사",content:"안 받으면 자격 정지예요 취소는 아닌데 활동 못 합니다"},{author:"드릴",content:"온라인 보수교육 신청 체육회 홈페이지에서 하면 됩니다"}]},
  {categoryId:4,title:"수영 접영 킥 타이밍 잡는 법",content:"접영 킥이 자꾸 팔 타이밍이랑 안 맞아요\n\n2비트 킥인데 입수할 때 한 번 푸시할 때 한 번 이거 맞죠?\n\n몸이 따로 노는 느낌이라 IM할 때 접영에서 시간 다 잡아먹힘\n\n드릴 추천해주세요",author:"칼꽂이",date:"2026-04-22 12:30:00",comments:[{author:"도마받침",content:"3-3-3 드릴 해보세요 킥3번 스트로크1번 반복 타이밍 잡기 좋아요"},{author:"채칼",content:"입수 때 다운킥 푸시 때 다운킥 맞아요 영상으로 체크해보세요"},{author:"감자칼",content:"바디돌핀 드릴 많이 하면 웨이브 감각 생겨서 킥 타이밍 맞아요"}]},
  {categoryId:10,title:"야구 실기 투구 기준 뭔가요",content:"야구 실기에서 투구 시험 기준이 어떻게 되나요\n\n스트라이크 존에 몇 개 넣어야 하는지\n\n구속 기준도 있나요 아니면 컨트롤만 보나요",author:"전선줄",date:"2026-04-22 14:30:00",comments:[{author:"콘센트",content:"구속 기준은 없어요 컨트롤이랑 폼 위주로 봅니다"},{author:"어댑터",content:"10구 중 6개 이상 스트라이크 존이면 괜찮다고 들었어요"},{author:"연장선",content:"포수 미트 정중앙으로 꽂으면 점수 잘 나옴 높낮이 컨트롤이 핵심"}]},
  {categoryId:16,title:"체조 실기 마루운동 구성 어떻게 하셨나요",content:"체조 실기 마루운동 구성을 어떻게 짜야 할지 모르겠어요\n\n물구나무서기 옆돌기 앞구르기 이런 걸 다 넣어야 하나요\n\n시간 제한이 있는지도 궁금합니다",author:"만년필",date:"2026-04-22 15:20:00",comments:[{author:"잉크병",content:"기본기 위주로 구성하면 됩니다 1분 30초 이내예요"},{author:"지우개",content:"물구나무 3초 유지 + 옆돌기 + 앞뒤구르기는 필수 포함이에요"},{author:"연필깎이",content:"난이도 높은 기술 하다 실패하면 감점 크니까 확실한 것만 넣으세요"}]},
  {categoryId:2,title:"축구 지도사 취업 현실",content:"축구 지도사 자격증 따면 취업이 잘 되나요\n\n유소년 축구교실이 제일 많은 거 같은데\n\n급여가 어떻게 되는지 현직 분들 경험 공유해주세요",author:"줄자",date:"2026-04-22 16:00:00",comments:[{author:"공구함",content:"유소년 축구교실 기준 월 250~300 정도예요 주말 근무 많아요"},{author:"렌치",content:"학교 방과후 축구 가면 시간 대비 괜찮은 편입니다"},{author:"드라이버",content:"처우보다 아이들 성장 보는 보람이 크죠 근데 체력이 진짜 필요함"}]},
  {categoryId:8,title:"합기도 실기 낙법 기준 궁금합니다",content:"합기도 실기에서 낙법을 본다고 하는데\n\n전방 측방 후방 다 해야 하나요\n\n높이 기준이 있는지 궁금합니다",author:"집게",date:"2026-04-22 17:00:00",comments:[{author:"핀셋",content:"전방 측방 후방 전부 봐요 높이 기준은 없고 폼 위주입니다"},{author:"가위",content:"낙법 소리가 커야 점수 잘 나와요 매트 치는 소리"},{author:"칼집",content:"구르기 후 바로 일어나는 것도 평가항목이에요 매끄럽게 하세요"}]},
];

const posts: PostData[] = [...existingPosts, ...newPosts];

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
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
        commentDate.setHours(commentDate.getHours() + Math.floor(Math.random() * 48) + 1);
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
  return NextResponse.json({ success: true, postsInserted, commentsInserted });
}
