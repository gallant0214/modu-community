import { getCloudinary } from "@/app/lib/cloudinary";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/trade/upload — 거래 글용 이미지 업로드 (최대 10장, Cloudinary)
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
    if (files.length > 10) {
      return NextResponse.json({ error: "최대 10장까지 가능합니다" }, { status: 400 });
    }

    const urls: string[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const cld = getCloudinary();
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        cld.uploader
          .upload_stream(
            {
              folder: "moducm/trade",
              format: "webp",
              transformation: [
                { width: 1600, height: 1600, crop: "limit", quality: "auto:best" },
              ],
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result as { secure_url: string });
            }
          )
          .end(buffer);
      });

      urls.push(result.secure_url);
    }

    return NextResponse.json({ urls });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "이미지 업로드 실패";
    console.error("Trade upload error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
