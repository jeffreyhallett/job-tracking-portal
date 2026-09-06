// Seed a few rows so the UI has something to show. Idempotent: a row is only
// inserted if the owner doesn't already have that company + role.
//
//   npm run db:seed
//
// Runs on plain Node 22 (type stripping), reads DATABASE_URL and
// DEFAULT_OWNER_ID from .env.local / .env if present. The first file that
// defines a variable wins, so ENV_FILE=.env.production.local targets the
// production database instead of the Development one.
import { neon } from "@neondatabase/serverless";

for (const file of [process.env.ENV_FILE, ".env.local", ".env"]) {
  if (!file) continue;
  try {
    process.loadEnvFile(file);
  } catch {
    // absent
  }
}

const url = process.env.DATABASE_URL;
const ownerId = process.env.DEFAULT_OWNER_ID || "default";
if (!url) throw new Error("DATABASE_URL is not set");

const sql = neon(url);
console.log(`database: ${describe(url)}`);
console.log(`owner:    ${ownerId}${process.env.DEFAULT_OWNER_ID ? "" : " (DEFAULT_OWNER_ID not set, using fallback)"}`);

function describe(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysAhead(n: number): string {
  return daysAgo(-n);
}

type SeedRow = {
  company: string;
  role: string;
  location?: string;
  workModel?: string;
  url?: string;
  source?: string;
  status: string;
  appliedDate?: string;
  deadline?: string;
  tags: string[];
  notes?: string;
  events: { date: string; label: string }[];
  updatedAt: string; // ISO timestamp
};

const rows: SeedRow[] = [
  {
    company: "InstaLILY",
    role: "Software Engineer",
    location: "New York, NY",
    workModel: "onsite",
    url: "https://www.instalily.ai/careers",
    source: "career site",
    status: "interested",
    deadline: daysAhead(4),
    tags: ["startup", "nyc", "ai"],
    notes: "Small team, AI agents for distributors. Deadline is soft but apply early.",
    events: [{ date: daysAgo(2), label: "Status: Interested" }],
    updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    company: "Amazon",
    role: "SDE I, Leo",
    source: "career site",
    status: "applied",
    appliedDate: daysAgo(20),
    tags: ["big-tech"],
    events: [
      { date: daysAgo(21), label: "Status: Interested" },
      { date: daysAgo(20), label: "Status: Applied" },
    ],
    // 20 days without movement: shows up under "needs attention" as stale.
    updatedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
  {
    company: "Google",
    role: "Software Engineer, New Grad",
    source: "career site",
    status: "applied",
    appliedDate: daysAgo(5),
    tags: ["big-tech"],
    events: [{ date: daysAgo(5), label: "Status: Applied" }],
    updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  },
];

let inserted = 0;
for (const r of rows) {
  const existing = await sql`
    select id from applications
    where owner_id = ${ownerId} and company = ${r.company} and role = ${r.role}
    limit 1`;
  if (existing.length > 0) {
    console.log(`skip   ${r.company} — ${r.role} (exists)`);
    continue;
  }
  await sql`
    insert into applications
      (owner_id, company, role, location, work_model, url, source, status,
       applied_date, deadline, tags, notes, events, updated_at)
    values
      (${ownerId}, ${r.company}, ${r.role}, ${r.location ?? null}, ${r.workModel ?? null},
       ${r.url ?? null}, ${r.source ?? null}, ${r.status}, ${r.appliedDate ?? null},
       ${r.deadline ?? null}, ${r.tags}, ${r.notes ?? null}, ${JSON.stringify(r.events)}::jsonb,
       ${r.updatedAt}::timestamptz)`;
  console.log(`insert ${r.company} — ${r.role}`);
  inserted++;
}
console.log(`done: ${inserted} inserted, ${rows.length - inserted} skipped`);
