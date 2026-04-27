import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ count: 0 });

  const { count } = await supabase
    .from("notification_logs")
    .select("*", { count: "exact", head: true })
    .eq("firebase_uid", user.uid)
    .eq("read", false);

  return NextResponse.json({ count: count ?? 0 });
}
