import { NextResponse } from "next/server";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ isAdmin: false });
  }
  return NextResponse.json({ isAdmin: isAdminUid(user.uid) });
}
