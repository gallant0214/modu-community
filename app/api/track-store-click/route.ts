import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/track-store-click — 스토어 링크 클릭 추적
export async function POST(request: Request) {
  try {
    const { store } = await request.json();
    if (!store || !["google_play", "app_store"].includes(store)) {
      return NextResponse.json({ error: "invalid store" }, { status: 400 });
    }

    await sql`CREATE TABLE IF NOT EXISTS store_clicks (
      id SERIAL PRIMARY KEY,
      store TEXT NOT NULL,
      clicked_at TIMESTAMPTZ DEFAULT NOW()
    )`;

    await sql`INSERT INTO store_clicks (store) VALUES (${store})`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
