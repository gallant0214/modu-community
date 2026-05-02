import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { escapePostgrestQuery } from "@/app/lib/security";

export const revalidate = 300;

// GET /api/practical-oral-notice/orgs?audience=main|disabled&q=keyword
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const audience = searchParams.get("audience") === "disabled" ? "disabled" : "main";
  const q = escapePostgrestQuery((searchParams.get("q") || "").trim());

  let query = supabase
    .from("sport_organizations")
    .select("id, sport_name, org_name, phone, zipcode, address, website")
    .eq("audience", audience)
    .order("sport_name", { ascending: true });

  if (q) {
    query = query.or(`sport_name.ilike.%${q}%,org_name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orgs: data || [] });
}
