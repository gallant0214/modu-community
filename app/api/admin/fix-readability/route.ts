import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  // 시드 데이터 게시글 중 줄바꿈이 부족한 게시글 찾기
  const posts = await sql`
    SELECT id, content FROM posts
    WHERE password IN ('__seed_community__', '__seed__')
  `;

  let updated = 0;
  for (const post of posts) {
    const content = post.content as string;

    // 이미 적절한 줄바꿈이 있는지 확인 (연속 줄바꿈 \n\n이 2개 이상이면 이미 OK)
    const doubleBreaks = (content.match(/\n\n/g) || []).length;
    if (doubleBreaks >= 2) continue;

    // 줄바꿈이 부족한 경우: 문장 끝(. ! ? 다 요 죠 등) 뒤에 줄바꿈 추가
    let newContent = content;

    // 단일 \n을 \n\n으로 변환 (이미 \n\n인 경우 제외)
    newContent = newContent.replace(/(?<!\n)\n(?!\n)/g, "\n\n");

    // 한국어 문장 종결어미 뒤에 줄바꿈이 없는 경우 추가
    // 마침표, 물음표, 느낌표 뒤에 공백이 오는 경우 줄바꿈으로 교체
    newContent = newContent.replace(/([.!?])(\s)(?=[가-힣A-Za-z0-9])/g, "$1\n\n");

    if (newContent !== content) {
      await sql`UPDATE posts SET content = ${newContent} WHERE id = ${post.id}`;
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated });
}
