import { getCloudinary } from "@/app/lib/cloudinary";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll("images") as File[];

  if (!files.length) {
    return NextResponse.json({ error: "이미지가 없습니다" }, { status: 400 });
  }

  if (files.length > 3) {
    return NextResponse.json({ error: "최대 3장까지 가능합니다" }, { status: 400 });
  }

  const urls: string[] = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const cld = getCloudinary();
    const result = await new Promise<any>((resolve, reject) => {
      cld.uploader
        .upload_stream(
          {
            folder: "moducm/posts",
            // format 을 최상위 레벨로 이동 (transformation 배열 내부의 format 은
            // 파생본만 만들고 원본은 업로드된 포맷 그대로 저장되는 현상이 관찰됨)
            format: "webp",
            transformation: [
              { width: 1600, height: 1600, crop: "limit", quality: "auto:best" },
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });

    urls.push(result.secure_url);
  }

    return NextResponse.json({ urls });
  } catch (e: any) {
    console.error("Upload error:", e);
    return NextResponse.json({ error: e?.message || "이미지 업로드 실패" }, { status: 500 });
  }
}
