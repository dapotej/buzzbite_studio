// Applies db/schema.sql to DATABASE_URL over Neon's HTTP driver. Safe to run repeatedly.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
  await sql.query(statement);
}
console.log("Schema applied.");
