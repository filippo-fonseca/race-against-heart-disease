import { test } from "node:test";
import assert from "node:assert/strict";
import planJson from "../../../../data/plan.json";
import { deriveId, diffPlan, exportPlanCsv, parsePlanCsv, readCsv, slug } from "../../admin/plan-import";
import { validatePlan } from "../plan";
import type { PlanSession } from "../types";

const plan = validatePlan(planJson);

const HEADER = "date,sport,title,detail,target_min,target_km,athletes,phase,week,id";

test("slug and deriveId are stable and hyphen-collapsed", () => {
  assert.equal(slug("  Swim: technique (easy)!! "), "swim-technique-easy");
  assert.equal(deriveId("2026-11-03", "run", "Easy run"), "2026-11-03-run-easy-run");
});

test("readCsv handles quotes, embedded commas, doubled quotes, newlines in fields, CRLF and a BOM", () => {
  const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"two\nlines",\r\n';
  const recs = readCsv(text);
  assert.deepEqual(
    recs.map((r) => r.fields),
    [
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"'],
      ["2", "two\nlines", ""],
    ],
  );
  assert.deepEqual(recs.map((r) => r.line), [1, 2, 3]);
});

test("parsePlanCsv reads the documented example, derives ids and splits athletes", () => {
  const text = [
    HEADER,
    '2026-11-03,run,Easy run,"Z2, walk breaks fine",35,,,Base 1,1,',
    '2026-11-03,swim,Technique,"4 x 50 drill, 4 x 100 easy",30,1.2,"filippo;emir",Base 1,1,',
  ].join("\n");
  const { rows, errors } = parsePlanCsv(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  const run = rows.find((r) => r.sport === "run")!;
  assert.equal(run.id, "2026-11-03-run-easy-run");
  assert.equal(run.detail, "Z2, walk breaks fine");
  assert.equal(run.targetMin, 35);
  assert.equal(run.targetKm, null);
  assert.deepEqual(run.athletes, []);
  assert.equal(run.phase, "Base 1");
  assert.equal(run.week, 1);
  const swim = rows.find((r) => r.sport === "swim")!;
  assert.deepEqual(swim.athletes, ["filippo", "emir"]);
  assert.equal(swim.targetKm, 1.2);
});

test("parsePlanCsv accepts CRLF, a quoted multi-line detail and a blank week (derived from the date)", () => {
  const text = `${HEADER}\r\n2026-11-10,bike,Intervals,"Line one\r\nLine two",60,,,Base 2,,custom-id\r\n`;
  const { rows, errors } = parsePlanCsv(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "custom-id");
  assert.equal(rows[0].detail, "Line one\r\nLine two");
  assert.equal(rows[0].week, 2);
});

test("parsePlanCsv reports bad rows with their line numbers and keeps the good ones", () => {
  const text = [
    HEADER,
    "2026-11-03,run,Easy run,,35,,,Base 1,1,", // line 2 ok
    "2026-11-03,rowing,Erg,,30,,,Base 1,1,", // line 3 bad sport
    "11/04/2026,run,Easy run,,35,,,Base 1,1,", // line 4 bad date
    "2026-11-10,run,Tempo,,40,,,Base 1,1,", // line 5 week mismatch (week 2)
    "2026-11-05,swim,Main set,,abc,,,Base 1,1,", // line 6 bad minutes
    "2026-11-05,swim,Drills,,30,,someone,Base 1,1,", // line 7 unknown athlete
    "2026-11-06,bike,Spin,,45,,,Base 1,1,dup", // line 8 ok
    "2026-11-06,bike,Spin again,,45,,,Base 1,1,dup", // line 9 duplicate id
    "2027-05-01,run,Late,,30,,,Taper,22,", // line 10 outside window
    "", // blank, skipped
  ].join("\n");
  const { rows, errors } = parsePlanCsv(text);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["2026-11-03-run-easy-run", "dup"],
  );
  assert.deepEqual(
    errors.map((e) => e.line),
    [3, 4, 5, 6, 7, 9, 10],
  );
  assert.match(errors[0].message, /sport "rowing"/);
  assert.match(errors[1].message, /YYYY-MM-DD/);
  assert.match(errors[2].message, /week 1 does not match the date: 2026-11-10 falls in week 2/);
  assert.match(errors[3].message, /target_min "abc"/);
  assert.match(errors[4].message, /athlete "someone"/);
  assert.match(errors[5].message, /id "dup" already used on line 8/);
  assert.match(errors[6].message, /outside the program/);
});

test("parsePlanCsv rejects a missing header column with one error on line 1 and no rows", () => {
  const { rows, errors } = parsePlanCsv("date,title\n2026-11-03,Easy run\n");
  assert.deepEqual(rows, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 1);
  assert.match(errors[0].message, /missing required column\(s\): sport/);
  assert.deepEqual(parsePlanCsv("").errors, [{ line: 1, message: "The file is empty." }]);
});

test("exportPlanCsv round-trips the whole program with zero diff", () => {
  const csv = exportPlanCsv(plan);
  assert.ok(csv.startsWith(`${HEADER}\n`));
  const { rows, errors } = parsePlanCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, plan.length);
  const diff = diffPlan(rows, plan, { scope: "all" });
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.unchanged, plan.length);
  assert.deepEqual(diff.range, { from: "2026-11-03", to: "2027-04-04" });
});

test("exportPlanCsv quotes fields that need it", () => {
  const s: PlanSession = { ...plan[0], title: 'Say "hi", twice', detail: "a\nb", athletes: ["emir"] };
  const csv = exportPlanCsv([s]);
  const { rows, errors } = parsePlanCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].title, 'Say "hi", twice');
  assert.equal(rows[0].detail, "a\nb");
  assert.deepEqual(rows[0].athletes, ["emir"]);
});

const base = (over: Partial<PlanSession>): PlanSession => ({
  id: "a",
  date: "2026-11-03",
  sport: "run",
  title: "Easy run",
  detail: null,
  targetMin: 35,
  targetKm: null,
  athletes: [],
  phase: "Base 1",
  week: 1,
  ...over,
});

test("diffPlan treats trimmed strings, empty vs null and athlete order as unchanged", () => {
  const existing = [base({ detail: null, athletes: ["filippo", "emir"], targetKm: 5 })];
  const incoming = [base({ detail: "", title: " Easy run ", athletes: ["emir", "filippo"], targetKm: 5.0 })];
  const diff = diffPlan(incoming, existing, { scope: "all" });
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
});

test("diffPlan lists the changed fields and the added rows", () => {
  const existing = [base({})];
  const incoming = [base({ title: "Steady run", targetMin: 40, athletes: ["emir"] }), base({ id: "b", date: "2026-11-04" })];
  const diff = diffPlan(incoming, existing, { scope: "all" });
  assert.equal(diff.changed.length, 1);
  assert.deepEqual(diff.changed[0].fields, ["title", "targetMin", "athletes"]);
  assert.equal(diff.changed[0].before.title, "Easy run");
  assert.equal(diff.changed[0].after.title, "Steady run");
  assert.deepEqual(
    diff.added.map((s) => s.id),
    ["b"],
  );
  assert.equal(diff.unchanged, 0);
});

test("diffPlan removes only inside the CSV range under csv-range, everything absent under all", () => {
  const existing = [
    base({ id: "nov3" }),
    base({ id: "nov5", date: "2026-11-05" }),
    base({ id: "nov7", date: "2026-11-07" }),
    base({ id: "dec1", date: "2026-12-01", week: 5, phase: "Base 2" }),
  ];
  const incoming = [base({ id: "nov3" }), base({ id: "nov7", date: "2026-11-07" })];

  const ranged = diffPlan(incoming, existing, { scope: "csv-range" });
  assert.deepEqual(ranged.range, { from: "2026-11-03", to: "2026-11-07" });
  assert.deepEqual(
    ranged.removed.map((s) => s.id),
    ["nov5"],
  );
  assert.equal(ranged.unchanged, 2);

  const all = diffPlan(incoming, existing, { scope: "all" });
  assert.deepEqual(
    all.removed.map((s) => s.id),
    ["nov5", "dec1"],
  );

  const empty = diffPlan([], existing, { scope: "csv-range" });
  assert.deepEqual(empty.removed, []);
  assert.deepEqual(empty.range, { from: "", to: "" });
  assert.equal(diffPlan([], existing, { scope: "all" }).removed.length, 4);
});
