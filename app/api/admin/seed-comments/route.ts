import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomDate(base: string): string {
  // 게시글 날짜 이후 1~60일 사이 랜덤
  const d = new Date(base);
  d.setDate(d.getDate() + Math.floor(Math.random() * 60) + 1);
  d.setHours(Math.floor(Math.random() * 14) + 8, Math.floor(Math.random() * 60));
  return d.toISOString();
}

// 중복 안 되는 닉네임 풀 (60개)
const nicks = [
  "헬스초보탈출","운동하는직장인","체대생일상","시험준비중","합격기원","새벽운동러",
  "주말체육관","근육통마니아","스트레칭좋아","동네헬스장","프로틴셰이크","런닝머신",
  "요가매니아","필테하는남자","수영왕김철수","축구소년","테니스치자","골프입문자",
  "태권소녀","농구하는아빠","배구좋아해요","탁구신동","검도유단자","합기도3단",
  "유도선수출신","배드민턴매니아","볼링300","필라테스강사","크로스핏러","마라톤완주",
  "등산매니아","자전거출퇴근","복싱다이어트","무에타이입문","클라이밍덕후","스쿼시초보",
  "생활체육인","체육교사지망","스포츠경영학","실기만남았다","구술벼락치기","교재3회독",
  "시험장긴장맨","떨리는손","차분한마음","준비완벽","D마이너스30","합격확신","불안한밤",
  "공부벌레","운동일기","땀흘리자","건강한삶","스포츠사랑","열정가득","끈기있는자",
  "매일운동","꾸준함이답","노력은배신안해","할수있다",
];

// 다양한 성격의 댓글 템플릿 (게시글 주제에 맞게 조합)
const commentStyles: Record<string, string[]> = {
  "감사": [
    "정보 감사합니다! 많은 도움이 됐어요",
    "와 진짜 꿀정보네요 감사합니다 ㅎㅎ",
    "이거 찾고 있었는데 감사합니다!",
    "선배님 후기 정말 감사합니다",
    "대박 이런 정보를 무료로.. 감사합니다",
  ],
  "공감": [
    "저도 같은 경험했어요 ㅋㅋ 공감됩니다",
    "아 맞아요 저도 그랬어요",
    "ㅋㅋㅋ 저만 그런 줄 알았는데",
    "완전 공감.. 긴장되면 진짜 평소 실력이 안 나와요",
    "저도요 ㅠㅠ 완전 공감합니다",
  ],
  "질문": [
    "혹시 준비 기간이 얼마나 걸리셨나요?",
    "시험 접수는 어디서 하셨어요?",
    "실기랑 구술 같은 날에 보나요?",
    "비전공자인데 가능할까요..?",
    "교재는 뭘로 공부하셨어요?",
    "합격률이 어느 정도인지 아시나요?",
    "시험장 분위기가 어땠나요?",
  ],
  "격려": [
    "다들 화이팅입니다!! 할 수 있어요",
    "저도 비전공인데 붙었어요! 다들 힘내세요",
    "포기하지 마세요 기본만 하면 됩니다",
    "연습만이 살길입니다 화이팅!",
    "합격 기원합니다 모두 파이팅!!",
  ],
  "경험": [
    "저는 작년에 봤는데 올해는 좀 바뀐 거 같네요",
    "저때는 시험관이 되게 친절했어요",
    "대기시간이 진짜 길어서 간식 챙겨가세요",
    "시험 전날 잠을 못 잤는데 그래도 붙었어요 ㅋㅋ",
    "저는 2번 만에 붙었습니다 처음엔 긴장해서 망했어요",
    "작년 하반기에 봤는데 거의 비슷한 내용이네요",
  ],
  "팁": [
    "팁 하나 추가하면 시험 전에 스트레칭 꼭 하세요",
    "유튜브에 기출 영상 있으니까 꼭 보세요",
    "교재보다 실전 연습이 훨씬 중요합니다",
    "시험장에 일찍 가서 분위기 파악하는 게 좋아요",
    "구술은 면접처럼 자신감 있게 답하는 게 중요해요",
    "실기는 속도보다 정확한 자세가 핵심입니다",
  ],
  "유머": [
    "ㅋㅋㅋ 시험장에서 다리가 후들후들",
    "구술 시험관 앞에서 머리가 하얘졌던 1인 ㅋㅋ",
    "시험 끝나고 치킨 시켜먹었습니다 합격 기원 치킨",
    "ㅋㅋ 같이 본 형이 너무 잘해서 위축됨",
    "시험보다 접수하는 게 더 힘들었음 ㅋㅋ 서버 터짐",
  ],
  "정보": [
    "참고로 올해부터 시험 방식이 좀 바뀌었대요",
    "시험 장소는 체육회 홈페이지에서 확인 가능합니다",
    "필기 합격 후 2년 안에 실기 봐야 합니다",
    "실기 불합격해도 다음 회차에 바로 재응시 가능해요",
    "시험 준비물: 신분증, 수험표, 운동복, 운동화",
  ],
};

// 각 게시글에 맞는 댓글 생성
function generateComments(postTitle: string, count: number): string[] {
  const comments: string[] = [];
  const styles = Object.values(commentStyles).flat();
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    let comment: string;
    do {
      comment = pick(styles);
    } while (used.has(comment) && used.size < styles.length - 5);
    used.add(comment);
    comments.push(comment);
  }
  return comments;
}

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  // seed로 생성된 게시글 ID 조회
  const { data: seedPosts, error: fetchErr } = await supabase
    .from("posts")
    .select("id, category_id, created_at")
    .or("ip_address.eq.seed,password.eq.__seed__")
    .order("id", { ascending: true });

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!seedPosts || seedPosts.length === 0) {
    return NextResponse.json({ error: "시드 게시글이 없습니다" }, { status: 404 });
  }

  let totalInserted = 0;
  const usedNicks = new Set<string>();

  for (const post of seedPosts) {
    const commentCount = Math.floor(Math.random() * 8) + 3; // 3~10개
    const comments = generateComments("", commentCount);

    for (const content of comments) {
      // 중복 안 되는 닉네임
      let author: string;
      do {
        author = pick(nicks);
      } while (usedNicks.has(`${post.id}-${author}`) && usedNicks.size < nicks.length * seedPosts.length);
      usedNicks.add(`${post.id}-${author}`);

      const date = randomDate(post.created_at!);

      const { error } = await supabase.from("comments").insert({
        post_id: post.id,
        author,
        password: "__seed__",
        content,
        ip_address: "seed",
        created_at: date,
      });
      if (error) {
        console.error(`Comment insert failed for post ${post.id}:`, error.message);
      } else {
        totalInserted++;
      }
    }

    // comments_count 재계산
    const { count } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id);
    await supabase
      .from("posts")
      .update({ comments_count: count ?? 0 })
      .eq("id", post.id);
  }

  return NextResponse.json({ success: true, posts: seedPosts.length, commentsInserted: totalInserted });
}
