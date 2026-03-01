import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL!.replace(/&channel_binding=[^&]*/g, "");
export const sql = neon(dbUrl);
