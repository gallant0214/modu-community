import { NextResponse } from "next/server";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ isAdmin: false });
  }

  if (isAdminUid(user.uid)) {
    return NextResponse.json({ isAdmin: true });
  }

  if (user.email) {
    const { count } = await supabase
      .from("admin_emails")
      .select("id", { count: "exact", head: true })
      .eq("email", user.email.toLowerCase());
    if ((count ?? 0) > 0) {
      return NextResponse.json({ isAdmin: true });
    }
  }

  return NextResponse.json({ isAdmin: false });
}
