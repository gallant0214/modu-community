import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
export const dynamic = "force-dynamic";
import { REGION_GROUPS } from "@/app/lib/region-data";
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
const w=["SEOUL","SEOUL","SEOUL","SEOUL","SEOUL","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","GYEONGGI","BUSAN","BUSAN","BUSAN","INCHEON","INCHEON","INCHEON","DAEGU","DAEGU","DAEJEON","DAEJEON","GWANGJU","GWANGJU","GYEONGNAM","GYEONGNAM","GYEONGBUK","GYEONGBUK","CHUNGNAM","CHUNGNAM","JEONNAM","JEONBUK","CHUNGBUK","GANGWON","ULSAN","SEJONG","JEJU"];
function pickRegion():string{const c=pick(w);const g=REGION_GROUPS.find((x)=>x.code===c);if(!g)return"서울특별시 - 강남구";return`${g.name} - ${pick(g.subRegions).name}`;}
interface PostData{categoryId:number;title:string;content:string;author:string;date:string;comments:{author:string;content:string}[];}
const existingPosts: PostData[] = [];
const newPosts: PostData[] = [
{categoryId:1,title:"필기 가채점 325점인데 합격이죠?",content:"어제 시험보고 바로 가채점 돌렸는데 325점 나왔어요\n\n커트라인이 보통 어느정도인지 몰라서 불안하네요\n\n40개 틀려도 합격이라는 말이 있던데 맞나요?",author:"물통뚜껑",date:"2026-04-19 18:32:00",comments:[{author:"삼각자",content:"325면 여유있게 합격이에요 축하드려요"},{author:"클립보드",content:"40개까지 틀려도 된다고 하니까 걱정 마세요"},{author:"형광펜",content:"저도 320점대인데 같이 합격하길 ㅠㅠ"}]},
{categoryId:1,title:"285점 3문제 차이로 떨어질수도 있나요",content:"가채점 285점인데 이의신청 복수정답 나오면 올라갈 수 있을까요\n\n3문제만 더 맞으면 되는건데 너무 아쉽습니다\n\n복수정답 기대해도 될까요?",author:"커튼봉",date:"2026-04-19 19:15:00",comments:[{author:"바인더",content:"24년도에 복수정답 10개 나온 적 있으니까 기대해보세요"},{author:"스탠드",content:"이의신청 많이 들어가면 가능성 있어요 포기하지 마세요"},{author:"메모지",content:"저도 비슷한 점수인데 같이 이의신청 넣어요"},{author:"연필깎이",content:"복수정답 3개만 걸려도 합격인거잖아요 화이팅"}]},
{categoryId:1,title:"교육학 2번 복수정답 이의신청 넣으신 분?",content:"교육학 2번 답이 애매한거 저만 그런게 아니었네요\n\n카톡방에서도 다들 이상하다고 하는데 이의신청 같이 넣읍시다\n\n16번도 복수정답 가능성 있다고 하던데",author:"지우개",date:"2026-04-19 20:45:00",comments:[{author:"물통뚜껑",content:"2번 저도 넣었어요 지문 자체가 모호함"},{author:"책갈피",content:"16번은 좀 애매하긴 한데 될지 모르겠어요"},{author:"자석클립",content:"사회학 8번이랑 심리학 5번도 같이 넣으세요"}]},
{categoryId:1,title:"사회학 8번 윤리 6번 이의신청 정리",content:"이의신청 넣을 문항 정리해봤습니다\n\n교육학 2번 16번\n사회학 8번\n심리학 5번\n윤리 6번\n\n다들 같이 넣어요 숫자가 많아야 검토라도 합니다",author:"필통",date:"2026-04-19 21:30:00",comments:[{author:"삼각자",content:"정리 감사합니다 바로 넣겠습니다"},{author:"커튼봉",content:"이거 다 복수정답 되면 저 합격인데 ㅠㅠ 제발"},{author:"스테이플러",content:"윤리 6번은 진짜 답이 두개임 교수님들도 의견 갈린다던데"}]},
{categoryId:1,title:"24년도랑 26년도 시험 유형 완전 달랐음",content:"24년도 기출 열심히 풀었는데 26년도 문제 보고 멘붕옴\n\n문제 유형이 완전히 바뀌었더라고요\n\n기출만 믿고 갔다가 큰코다칠뻔 했습니다",author:"책꽂이",date:"2026-04-19 22:10:00",comments:[{author:"바인더",content:"맞아요 저도 기출이랑 너무 달라서 당황함"},{author:"형광펜",content:"응용문제가 많아졌어요 단순암기론 한계있음"},{author:"연필깎이",content:"그래도 기출 안하면 더 못봄 기본은 기출이죠"},{author:"메모지",content:"내년 시험은 또 어떻게 바뀔지 ㄷㄷ"}]},
{categoryId:1,title:"복수정답 24년도에 10개 나온거 실화임?",content:"24년도 시험에서 복수정답이 10문제나 나왔다는게 사실인가요?\n\n올해도 그정도 나오면 커트 근처 사람들 다 살 수 있을텐데\n\n아시는 분 계시면 알려주세요",author:"볼펜꽂이",date:"2026-04-20 09:20:00",comments:[{author:"물통뚜껑",content:"네 맞아요 그때 진짜 난리났었음"},{author:"책갈피",content:"근데 매년 다르니까 너무 기대는 하지 마세요"},{author:"지우개",content:"올해 문항도 애매한거 많아서 기대는 해봄직"}]},
{categoryId:1,title:"실기구술 교재 뭐 사야됨?",content:"필기 가채점 합격권이라 실기구술 준비하려는데\n\n교재가 너무 많아서 뭘 사야할지 모르겠어요\n\n챔피터 단박에스릴 아놀드 해커스 다 추천하던데 어떤게 좋나요",author:"연필꽂이",date:"2026-04-20 10:45:00",comments:[{author:"삼각자",content:"챔피터 구술 정리 잘 되어있어요 저는 이거로 합격함"},{author:"스탠드",content:"단박에스릴이 실기 동작 사진 많아서 좋아요"},{author:"필통",content:"해커스는 기출 정리가 깔끔함 구술 대비용으로 괜찮"},{author:"자석클립",content:"아놀드는 좀 두꺼워서 시간 없으면 비추"}]},
{categoryId:1,title:"구술 준비 어떻게 하세요?",content:"실기는 동작 연습하면 되는데 구술은 어떻게 준비해야할지 감이 안잡혀요\n\n기출 위주로 하면 되나요 아니면 교재를 다 봐야하나요",author:"스테이플러",date:"2026-04-20 14:30:00",comments:[{author:"커튼봉",content:"기출 먼저 다 보고 유튜브에 구술 정리 영상 많아요"},{author:"책꽂이",content:"블로그에 후기 올라온거 보면 기출 반복 많이 나옴"},{author:"형광펜",content:"카톡방 족보 꼭 구하세요 거기가 핵심임"}]},
{categoryId:1,title:"보디빌딩 실기 동작 25년부터 변경된거 아시죠?",content:"혹시 모르시는 분 있을까봐 공유합니다\n\n25년부터 복근 트위스트 해피포즈 삭제됐어요\n\n예전 자료 보고 연습하시면 안됩니다",author:"바인더",date:"2026-04-20 16:00:00",comments:[{author:"볼펜꽂이",content:"오 이거 몰랐으면 큰일날뻔 감사합니다"},{author:"연필꽂이",content:"삭제된 동작 연습할뻔 했네요 ㄷㄷ"},{author:"메모지",content:"체육회 공지 꼭 확인하세요 매년 바뀌는게 있음"}]},
{categoryId:1,title:"실기 몇번 반복하면 그만하라고 하나요?",content:"실기 시험 때 동작을 몇번까지 반복해야하나요?\n\n계속하다가 멈추라는 신호가 있다고 들었는데",author:"자석클립",date:"2026-04-20 18:20:00",comments:[{author:"삼각자",content:"3~4번 반복하면 그만이라고 신호줘요"},{author:"스탠드",content:"너무 빨리하지 말고 정확하게 하는게 중요함"},{author:"필통",content:"그만 소리 나면 바로 멈추면 돼요 당황하지 마세요"},{author:"지우개",content:"감독관마다 좀 다르긴 한데 보통 3~4회입니다"}]},
{categoryId:1,title:"장체 노체 동시에 추가취득 가능한가요?",content:"보디빌딩 자격증 있는 상태에서 장애인체육 노인체육 동시에 추가취득 할 수 있나요?\n\n따로따로 해야하는건지 같이 신청 가능한지 궁금합니다",author:"메모지",date:"2026-04-21 09:00:00",comments:[{author:"책꽂이",content:"동시 가능해요 저도 같이 넣었어요"},{author:"커튼봉",content:"추가취득은 실기구술만 보면 되니까 같이 하는게 효율적"},{author:"바인더",content:"다만 시험일정 겹치는지 확인하세요"}]},
{categoryId:1,title:"구술 기출 - CPR 깊이 물어봄",content:"작년 구술에서 CPR 관련 질문 나왔대요\n\n가슴압박 깊이가 몇cm인지 물어봤다고 합니다\n\n성인 5cm 소아 4~5cm 이거 외워가세요",author:"형광펜",date:"2026-04-21 11:30:00",comments:[{author:"볼펜꽂이",content:"이런 기본적인거 틀리면 진짜 아까움"},{author:"스테이플러",content:"응급처치 파트 은근 잘 나와요 꼭 보세요"},{author:"연필꽂이",content:"감사합니다 정리해둘게요"}]},
{categoryId:1,title:"구술 기출 - 하체근육 3가지 말해보세요",content:"구술에서 하체근육 3가지 말하라는 문제 나왔었다고 합니다\n\n대퇴사두근 대퇴이두근 비복근 정도 답하면 될듯\n\n해부학 기본은 알고 가야해요",author:"책갈피",date:"2026-04-21 13:45:00",comments:[{author:"삼각자",content:"대둔근도 넣어도 되지 않나요?"},{author:"물통뚜껑",content:"3가지만 말하면 되니까 아는거 자신있게 말하면 됨"},{author:"필통",content:"해부학 용어 한글 영어 둘다 알아두면 좋아요"}]},
{categoryId:1,title:"필수아미노산 9가지 중 3개 말하기",content:"구술 기출에 필수아미노산 9가지 중 3개 말하라는거 있었어요\n\n류신 이소류신 발린 이 3개가 제일 외우기 쉬움\n\nBCAA 아시면 바로 답할 수 있어요",author:"스탠드",date:"2026-04-21 15:20:00",comments:[{author:"형광펜",content:"BCAA로 외우면 편하죠 류신 이소류신 발린"},{author:"메모지",content:"트립토판 라이신 메티오닌도 같이 외워두세요"},{author:"커튼봉",content:"영양학 파트 구술에 은근 많이 나옴"}]},
{categoryId:1,title:"실기 교재 필요없다는 의견도 있던데",content:"실기는 교재 없이 기출 동작만 반복 연습하면 된다는 분들이 계시더라고요\n\n교재 사는게 돈 아깝다는 건지 진짜 필요없는건지\n\n경험자분들 의견 부탁드립니다",author:"연필깎이",date:"2026-04-21 17:00:00",comments:[{author:"삼각자",content:"실기는 유튜브 동작 영상이면 충분해요 교재까진 필요없음"},{author:"볼펜꽂이",content:"구술은 교재 있는게 좋은데 실기는 안봐도 됨"},{author:"자석클립",content:"기출 동작 리스트만 뽑아서 연습하면 됩니다"},{author:"바인더",content:"돈 아끼고 유튜브로 폼 체크하세요"}]},
{categoryId:1,title:"58점인데 합격 가능할까요",content:"가채점 58점 나왔는데 커트라인 60점이면 떨어지는거죠?\n\n복수정답으로 2점 올라갈 수 있을까요\n\n불안해서 잠이 안옵니다",author:"클립보드",date:"2026-04-21 21:30:00",comments:[{author:"커튼봉",content:"이의신청 꼭 넣으시고 기다려보세요"},{author:"책꽂이",content:"복수정답 하나만 걸려도 되니까 희망 버리지 마세요"},{author:"스테이플러",content:"작년에도 커트 근처에서 복수정답으로 살아난 사람 많아요"}]},
{categoryId:1,title:"59점 커트라인 1점차 미쳐버리겠음",content:"진짜 1점 차이로 떨어질 수 있다고 생각하니까 멘탈이 안잡힘\n\n이의신청 다 넣긴 했는데 결과 나올때까지 어떻게 기다리냐\n\n같은 상황이신 분 계신가요",author:"책꽂이",date:"2026-04-22 08:15:00",comments:[{author:"물통뚜껑",content:"저도 비슷해요 같이 힘내봐요"},{author:"형광펜",content:"결과 나올때까지 실기 준비하면서 기다리는게 나아요"},{author:"연필깎이",content:"복수정답 1개만 걸려도 되는거잖아요 긍정적으로 생각해요"},{author:"필통",content:"멘탈 잡고 일단 실기구술도 준비하세요 합격할수도 있으니까"}]},
{categoryId:1,title:"필기 합격하면 실기구술 일정 언제쯤?",content:"필기 합격 확정되면 실기구술 접수가 바로 열리나요?\n\n일정이 어떻게 되는지 아시는 분 계신가요\n\n미리 준비하려고 합니다",author:"자석클립",date:"2026-04-22 10:00:00",comments:[{author:"삼각자",content:"보통 필기 합격 발표 후 한달 내로 접수 시작해요"},{author:"스탠드",content:"체육회 홈페이지 수시로 확인하세요 공지 올라옵니다"},{author:"지우개",content:"작년 기준으로 6월쯤이었어요 올해도 비슷할듯"}]},
{categoryId:1,title:"카톡방 족보 어디서 구하나요",content:"구술 준비하는데 카톡방 족보가 중요하다고 하시는데\n\n어디서 구할 수 있나요? 오픈카톡방인가요?\n\n검색해도 잘 안나와서요",author:"볼펜꽂이",date:"2026-04-22 13:40:00",comments:[{author:"바인더",content:"네이버 카페에서 오픈카톡 링크 공유하는 글 있어요"},{author:"메모지",content:"여기 커뮤니티에도 가끔 올라오니까 자주 확인하세요"},{author:"책갈피",content:"족보도 중요한데 기출 반복이 제일 중요합니다"}]},
{categoryId:1,title:"보디빌딩 실기 동작 리스트 정리",content:"25년 변경사항 반영해서 현재 실기 동작 리스트 정리해봤어요\n\n복근 트위스트 해피포즈는 삭제됐고\n\n프론트 더블바이셉스 사이드체스트 백 더블바이셉스 등 기본 포징 위주로 준비하면 됩니다\n\n정확한 리스트는 체육회 공지 꼭 확인하세요",author:"삼각자",date:"2026-04-22 16:50:00",comments:[{author:"연필꽂이",content:"정리 감사합니다 공지 확인하고 연습할게요"},{author:"클립보드",content:"포징 연습 거울 앞에서 매일 하는게 좋아요"},{author:"커튼봉",content:"유튜브에 포징 가이드 영상 많으니까 참고하세요"},{author:"스테이플러",content:"기본 포징 정확하게 하면 점수 잘 나옵니다"}]},
];
const posts: PostData[] = [...existingPosts, ...newPosts];
export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  let postsInserted = 0, commentsInserted = 0;
  for (const post of newPosts) {
    const region = pickRegion();
    try {
      const rv = Math.floor(Math.random() * 81) + 20;
      const result = await sql`INSERT INTO posts (category_id, title, content, author, password, region, tags, ip_address, created_at, updated_at, views) VALUES (${post.categoryId}, ${post.title}, ${post.content}, ${post.author}, ${"__seed_community__"}, ${region}, ${"기타"}, ${"seed_community"}, ${post.date}::timestamp, ${post.date}::timestamp, ${rv}) RETURNING id`;
      postsInserted++;
      const postId = result[0]?.id; if (!postId) continue;
      for (const c of post.comments) {
        const cd = new Date(post.date); cd.setHours(cd.getHours() + Math.floor(Math.random() * 48) + 1); cd.setMinutes(Math.floor(Math.random() * 60));
        try { await sql`INSERT INTO comments (post_id, author, password, content, ip_address, created_at) VALUES (${postId}, ${c.author}, ${"__seed_community__"}, ${c.content}, ${"seed_community"}, ${cd.toISOString()}::timestamp)`; commentsInserted++; } catch {}
      }
      await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${postId}) WHERE id = ${postId}`;
    } catch {}
  }
  return NextResponse.json({ success: true, postsInserted, commentsInserted });
}
