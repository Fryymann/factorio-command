#!/usr/bin/env node
// The factorio-command project board from the command line. Plain Node and the `gh` CLI, so it
// runs the same on Windows and Linux. Needs `gh auth refresh -s project` once.
//
//   node .claude/skills/repo-workflow/board.mjs --help
import { spawnSync } from "node:child_process";

const OWNER = "Fryymann";
const REPO = "Fryymann/factorio-command";
const TITLE = "factorio-command";
const HUMANS = { Fryymann: "Ian", KalebMarquez: "Kaleb" };

const HELP = `Usage: node .claude/skills/repo-workflow/board.mjs <command>

  show                     every open item: status, phase, owner, whose turn, blocked by
  turn <login>             items whose turn is <login>'s, plus everything in Needs decision
  set <n> [field=value]... add issue/PR #n to the board if needed and set fields:
                           status=, owner=, phase= (a value's prefix is enough: phase=2)
  assign <n> <login>...    make it these people's turn (replaces the assignees)
  assign <n> --nobody      nobody's turn (clears the assignees)
  block <n> --by <m>...    record that issue #n is blocked by issue(s) #m
  blocked <n>              list what blocks issue #n, and what it blocks

Logins: Fryymann (Ian), KalebMarquez (Kaleb).`;

function gh(args, { json = true, input } = {}) {
  const r = spawnSync("gh", args, { encoding: "utf8", input, shell: false });
  if (r.error) throw new Error(`couldn't run gh: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`gh ${args.join(" ")} failed:\n${r.stderr.trim()}`);
  return json ? JSON.parse(r.stdout || "null") : r.stdout;
}

function project() {
  const list = gh(["project", "list", "--owner", OWNER, "--format", "json"]);
  const p = list.projects.find((x) => x.title === TITLE);
  if (!p) throw new Error(`no project called "${TITLE}" for ${OWNER}`);
  return p;
}

function fields(p) {
  const out = gh(["project", "field-list", String(p.number), "--owner", OWNER, "--format", "json"]);
  return Object.fromEntries(out.fields.map((f) => [f.name.toLowerCase(), f]));
}

function items(p) {
  const out = gh([
    "project",
    "item-list",
    String(p.number),
    "--owner",
    OWNER,
    "--format",
    "json",
    "--limit",
    "500",
  ]);
  return out.items;
}

const num = (s) => {
  const n = Number(String(s).replace(/^#/, ""));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`not an issue or PR number: ${s}`);
  return n;
};

function issue(n) {
  return gh(["api", `repos/${REPO}/issues/${n}`]);
}

function blockers(n) {
  return gh(["api", `repos/${REPO}/issues/${n}/dependencies/blocked_by`]);
}

function blocking(n) {
  return gh(["api", `repos/${REPO}/issues/${n}/dependencies/blocking`]);
}

const turnOf = (it) => (it.assignees ?? []).map((a) => HUMANS[a] ?? a).join(", ") || "-";

function row(it, blockedBy) {
  const c = it.content ?? {};
  const kind = c.type === "PullRequest" ? "PR" : "  ";
  const b = blockedBy?.length ? ` [blocked by ${blockedBy.map((x) => "#" + x).join(", ")}]` : "";
  return `${kind} #${String(c.number).padEnd(4)} ${String(it.status ?? "-").padEnd(15)} ${String(it.phase ?? "-").padEnd(18)} ${String(it.owner ?? "-").padEnd(6)} turn: ${turnOf(it).padEnd(12)} ${c.title}${b}`;
}

function openItems(p) {
  return items(p)
    .filter((it) => it.content?.number && it.status !== "Done")
    .sort(
      (a, b) =>
        String(a.phase ?? "~").localeCompare(String(b.phase ?? "~")) ||
        a.content.number - b.content.number,
    );
}

function openBlockers(it) {
  if (it.content?.type !== "Issue") return [];
  return blockers(it.content.number)
    .filter((b) => b.state === "open")
    .map((b) => b.number);
}

function show() {
  const p = project();
  for (const it of openItems(p)) console.log(row(it, openBlockers(it)));
}

function turn(login) {
  if (!HUMANS[login]) throw new Error(`unknown login ${login}; use Fryymann or KalebMarquez`);
  const p = project();
  const mine = openItems(p).filter(
    (it) => (it.assignees ?? []).includes(login) || it.status === "Needs decision",
  );
  if (!mine.length) console.log(`Nothing is waiting on ${HUMANS[login]}.`);
  for (const it of mine) console.log(row(it, openBlockers(it)));
}

function pickOption(field, value) {
  const want = value.toLowerCase();
  const opts = field.options ?? [];
  const hit = opts.filter(
    (o) => o.name.toLowerCase() === want || o.name.toLowerCase().startsWith(want),
  );
  if (hit.length !== 1) {
    throw new Error(
      `"${value}" matches ${hit.length} options of ${field.name}: ${opts.map((o) => o.name).join(", ")}`,
    );
  }
  return hit[0];
}

function set(n, pairs) {
  const p = project();
  const fs = fields(p);
  let it = items(p).find((x) => x.content?.number === n);
  let id = it?.id;
  if (!id) {
    const added = gh([
      "project",
      "item-add",
      String(p.number),
      "--owner",
      OWNER,
      "--url",
      issue(n).html_url,
      "--format",
      "json",
    ]);
    id = added.id;
    console.log(`added #${n} to the board`);
  }
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 1) throw new Error(`expected field=value, got "${pair}"`);
    const name = pair.slice(0, eq).toLowerCase();
    const f = fs[name];
    if (!f)
      throw new Error(`no field "${name}" on the board; fields: ${Object.keys(fs).join(", ")}`);
    const o = pickOption(f, pair.slice(eq + 1));
    gh(
      [
        "project",
        "item-edit",
        "--id",
        id,
        "--project-id",
        p.id,
        "--field-id",
        f.id,
        "--single-select-option-id",
        o.id,
      ],
      { json: false },
    );
    console.log(`#${n}: ${f.name} = ${o.name}`);
  }
}

function assign(n, logins) {
  if (logins.length === 0) throw new Error("usage: assign <n> <login>... (use --nobody to clear)");
  if (logins.length === 1 && logins[0] === "--nobody") logins = [];
  for (const l of logins)
    if (!HUMANS[l]) throw new Error(`unknown login ${l}; use Fryymann or KalebMarquez`);
  // The issues endpoint covers PRs too, and PATCH replaces the whole list.
  const args = ["api", "--method", "PATCH", `repos/${REPO}/issues/${n}`];
  if (logins.length === 0) args.push("--input", "-");
  for (const l of logins) args.push("-f", `assignees[]=${l}`);
  gh(args, { input: logins.length === 0 ? JSON.stringify({ assignees: [] }) : undefined });
  console.log(`#${n}: turn = ${logins.map((l) => HUMANS[l]).join(", ") || "nobody"}`);
}

function block(n, by) {
  for (const m of by) {
    const id = issue(m).id;
    gh([
      "api",
      "--method",
      "POST",
      `repos/${REPO}/issues/${n}/dependencies/blocked_by`,
      "-F",
      `issue_id=${id}`,
    ]);
    console.log(`#${n} is blocked by #${m}`);
  }
}

function blocked(n) {
  const fmt = (list) =>
    list.map((b) => `#${b.number} (${b.state}) ${b.title}`).join("\n  ") || "nothing";
  console.log(`#${n} is blocked by:\n  ${fmt(blockers(n))}`);
  console.log(`#${n} blocks:\n  ${fmt(blocking(n))}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (!cmd || cmd === "--help" || cmd === "-h") console.log(HELP);
  else if (cmd === "show") show();
  else if (cmd === "turn") turn(rest[0]);
  else if (cmd === "set") set(num(rest[0]), rest.slice(1));
  else if (cmd === "assign") assign(num(rest[0]), rest.slice(1));
  else if (cmd === "block") {
    const i = rest.indexOf("--by");
    if (i !== 1 || rest.length < 3) throw new Error("usage: block <n> --by <m>...");
    block(num(rest[0]), rest.slice(2).map(num));
  } else if (cmd === "blocked") blocked(num(rest[0]));
  else throw new Error(`unknown command "${cmd}"\n\n${HELP}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
