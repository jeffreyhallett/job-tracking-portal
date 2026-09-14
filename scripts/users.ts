// Account administration. There is no self-service sign-up, so every account is
// created here.
//
//   npm run user:add      -- friend@example.com --name "Friend"
//   npm run user:list
//   npm run user:password -- friend@example.com
//   npm run user:claim    -- me@example.com --from jeffrey
//   npm run users         -- remove friend@example.com --delete-applications
//
// Runs on plain Node (type stripping), reading DATABASE_URL from .env.local or
// .env. The first file that defines a variable wins, so
// ENV_FILE=.env.production.local targets production instead of Development.
//
// The crypto is imported with an explicit .ts extension: type stripping does not
// map ./x.js onto x.ts the way the bundler does for api/.
import { neon } from "@neondatabase/serverless";
import { agentTokenPrefix, generateAgentToken, generatePassword, hashAgentToken, hashPassword, looksLikeEmail, normalizeEmail } from "../shared/crypto.ts";
import { passwordProblem } from "../shared/password.ts";

for (const file of [process.env.ENV_FILE, ".env.local", ".env"]) {
  if (!file) continue;
  try {
    process.loadEnvFile(file);
  } catch {
    // absent
  }
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = neon(url);

type Flags = { positional: string[]; named: Record<string, string | true> };

function parseArgs(argv: string[]): Flags {
  const positional: string[] = [];
  const named: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      named[key] = next;
      i++;
    } else {
      named[key] = true;
    }
  }
  return { positional, named };
}

function describe(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function requireEmail(flags: Flags): string {
  const raw = flags.positional[0];
  if (!raw) fail("pass an email address");
  const email = normalizeEmail(raw);
  if (!looksLikeEmail(email)) fail(`"${raw}" does not look like an email address`);
  return email;
}

function str(value: string | true | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

type UserRecord = { id: string; email: string; name: string | null };

async function findUser(email: string): Promise<UserRecord | undefined> {
  const rows = (await sql`select id, email, name from users where email = ${email} limit 1`) as UserRecord[];
  return rows[0];
}

// ---------------------------------------------------------------------------

async function add(flags: Flags): Promise<void> {
  const email = requireEmail(flags);
  const name = str(flags.named.name) ?? null;
  const explicit = str(flags.named.password);
  if (explicit) {
    const problem = passwordProblem(explicit);
    if (problem) fail(`--password: ${problem.toLowerCase()}`);
  }
  // A generated password is marked must-change, so the person picks their own on
  // first sign-in. One passed with --password is taken as deliberate.
  const password = explicit ?? generatePassword();
  const mustChange = explicit === undefined;

  if (await findUser(email)) fail(`${email} already has an account (use "user:password" to reset it)`);

  const rows = (await sql`
    insert into users (email, name, password_hash, must_change_password)
    values (${email}, ${name}, ${hashPassword(password)}, ${mustChange})
    returning id`) as { id: string }[];
  const id = rows[0]?.id;
  if (!id) fail("insert returned nothing");

  console.log(`created ${email}`);
  console.log(`  id:       ${id}`);
  if (mustChange) {
    console.log(`  password: ${password}   (temporary — they choose their own at first sign-in)`);
  } else {
    console.log(`  password: the one you passed in`);
  }
  console.log(`\nSend them the address of the app and that password over something private.`);
}

async function list(): Promise<void> {
  const rows = (await sql`
    select u.id, u.email, u.name, u.must_change_password, u.last_seen_at, u.created_at,
           u.agent_token_prefix,
           (select count(*) from applications a where a.owner_id = u.id::text) as applications
    from users u
    order by u.created_at`) as {
    id: string;
    email: string;
    name: string | null;
    must_change_password: boolean;
    last_seen_at: string | null;
    created_at: string | null;
    agent_token_prefix: string | null;
    applications: string;
  }[];

  if (rows.length === 0) {
    console.log('no accounts yet — create one with `npm run user:add -- you@example.com`');
    return;
  }
  for (const r of rows) {
    const bits = [
      `${r.applications} application${r.applications === "1" ? "" : "s"}`,
      r.agent_token_prefix ? `agent token ${r.agent_token_prefix}…` : "no agent token",
      r.must_change_password ? "must change password" : null,
      r.last_seen_at ? `last seen ${r.last_seen_at.slice(0, 10)}` : "never signed in",
    ].filter(Boolean);
    console.log(`${r.email}${r.name ? ` (${r.name})` : ""}\n  ${r.id}\n  ${bits.join(" · ")}`);
  }

  // Rows whose owner_id is not a user id at all: the pre-multi-user data.
  const orphans = (await sql`
    select owner_id, count(*) as n from applications
    where owner_id not in (select id::text from users)
    group by owner_id order by n desc`) as { owner_id: string; n: string }[];
  if (orphans.length > 0) {
    console.log(`\nunclaimed applications (no account owns them):`);
    for (const o of orphans) console.log(`  owner_id "${o.owner_id}": ${o.n}`);
    console.log(`  claim them with: npm run user:claim -- <email> --from <owner_id>`);
  }
}

async function password(flags: Flags): Promise<void> {
  const email = requireEmail(flags);
  const user = await findUser(email);
  if (!user) fail(`no account for ${email}`);

  const explicit = str(flags.named.password);
  if (explicit) {
    const problem = passwordProblem(explicit);
    if (problem) fail(`--password: ${problem.toLowerCase()}`);
  }
  const next = explicit ?? generatePassword();
  const mustChange = explicit === undefined;

  await sql`
    update users
    set password_hash = ${hashPassword(next)}, must_change_password = ${mustChange},
        failed_attempts = 0, locked_until = null, updated_at = now()
    where id = ${user.id}`;

  console.log(`reset the password for ${email}`);
  if (mustChange) console.log(`  password: ${next}   (temporary)`);
  console.log(`  every signed-in device for this account has been signed out`);
}

/** Point pre-multi-user rows (owner_id 'jeffrey', 'default', ...) at a real account. */
async function claim(flags: Flags): Promise<void> {
  const email = requireEmail(flags);
  const user = await findUser(email);
  if (!user) fail(`no account for ${email} — create it first with user:add`);

  const from = str(flags.named.from) ?? process.env.DEFAULT_OWNER_ID ?? "default";
  if (from === user.id) fail("those rows already belong to this account");

  const counted = (await sql`select count(*) as n from applications where owner_id = ${from}`) as { n: string }[];
  const n = Number(counted[0]?.n ?? 0);
  if (n === 0) {
    console.log(`nothing to claim: no applications with owner_id "${from}"`);
    return;
  }
  if (flags.named["dry-run"]) {
    console.log(`would move ${n} application(s) from owner_id "${from}" to ${email}`);
    return;
  }
  await sql`update applications set owner_id = ${user.id} where owner_id = ${from}`;
  console.log(`moved ${n} application(s) from owner_id "${from}" to ${email} (${user.id})`);
}

/** Mint an agent token from the command line, for setting a task up headlessly. */
async function agentToken(flags: Flags): Promise<void> {
  const email = requireEmail(flags);
  const user = await findUser(email);
  if (!user) fail(`no account for ${email}`);

  if (flags.named.revoke) {
    await sql`update users set agent_token_hash = null, agent_token_prefix = null, agent_token_created_at = null, updated_at = now() where id = ${user.id}`;
    console.log(`revoked the agent token for ${email}`);
    return;
  }
  const token = generateAgentToken();
  await sql`
    update users
    set agent_token_hash = ${hashAgentToken(token)}, agent_token_prefix = ${agentTokenPrefix(token)},
        agent_token_created_at = now(), updated_at = now()
    where id = ${user.id}`;
  console.log(`new agent token for ${email} (any previous one has stopped working):\n\n  ${token}\n`);
  console.log("Only its hash is stored, so this is the one time it is printed.");
}

async function remove(flags: Flags): Promise<void> {
  const email = requireEmail(flags);
  const user = await findUser(email);
  if (!user) fail(`no account for ${email}`);

  const counted = (await sql`select count(*) as n from applications where owner_id = ${user.id}`) as { n: string }[];
  const n = Number(counted[0]?.n ?? 0);
  if (n > 0 && !flags.named["delete-applications"]) {
    fail(`${email} still owns ${n} application(s). Re-run with --delete-applications to delete them too, or move them first with user:claim.`);
  }
  if (n > 0) await sql`delete from applications where owner_id = ${user.id}`;
  await sql`delete from users where id = ${user.id}`;
  console.log(`deleted ${email}${n > 0 ? ` and ${n} application(s)` : ""}`);
}

// ---------------------------------------------------------------------------

const USAGE = `usage: npm run users -- <command> [args]

  add <email> [--name "Full Name"] [--password <pw>]
      Create an account. Without --password a temporary one is generated and
      the person is asked to choose their own at first sign-in.

  list
      Every account, how many applications it owns, and any unclaimed rows.

  password <email> [--password <pw>]
      Reset a password. Signs that account out everywhere.

  claim <email> [--from <owner_id>] [--dry-run]
      Move applications written before accounts existed onto an account.
      --from defaults to DEFAULT_OWNER_ID, else "default".

  agent-token <email> [--revoke]
      Mint (or revoke) that account's agent token for scheduled tasks.

  remove <email> [--delete-applications]
      Delete an account. Refuses while it still owns applications unless
      --delete-applications is given.`;

const [command, ...rest] = process.argv.slice(2);
const flags = parseArgs(rest);

if (!command || command === "help" || command === "--help") {
  console.log(USAGE);
  process.exit(0);
}

console.log(`database: ${describe(url)}\n`);

switch (command) {
  case "add":
    await add(flags);
    break;
  case "list":
    await list();
    break;
  case "password":
    await password(flags);
    break;
  case "claim":
    await claim(flags);
    break;
  case "agent-token":
    await agentToken(flags);
    break;
  case "remove":
    await remove(flags);
    break;
  default:
    console.error(`unknown command "${command}"\n`);
    console.log(USAGE);
    process.exit(1);
}
