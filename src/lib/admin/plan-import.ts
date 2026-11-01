import { isISODate } from "../training/dates";
import { PLAN_WEEKS, planWindow, weekOf } from "../training/plan";
import type { AthleteSlug, PlanSession, Sport } from "../training/types";

/**
 * CSV import and export of the training program, per docs/ADMIN.md.
 *
 *   parsePlanCsv   text  -> rows + line-numbered errors
 *   diffPlan       rows  -> what would change against the DB
 *   applyPlanDiff  diff  -> writes, then revalidates the training cache
 *   exportPlanCsv  rows  -> text in the same format (round-trips to no-op)
 *
 * The parser is hand-rolled (quotes, embedded commas and newlines, CRLF) so
 * the admin page needs no new dependency. Only applyPlanDiff touches the
 * database and Next; it imports both lazily so this module stays loadable
 * from tests.
 */

export const PLAN_CSV_HEADER = ["date", "sport", "title", "detail", "target_min", "target_km", "athletes", "phase", "week", "id"] as const;

const SPORTS: readonly Sport[] = ["swim", "bike", "run", "strength", "other"];
const ATHLETES: readonly AthleteSlug[] = ["filippo", "emir"];

export interface PlanCsvError {
  /** 1-based physical line where the record starts (the header is line 1). */
  line: number;
  message: string;
}

export interface PlanCsvResult {
  rows: PlanSession[];
  errors: PlanCsvError[];
}

export interface PlanChange {
  before: PlanSession;
  after: PlanSession;
  /** PlanSession keys whose normalised value differs. */
  fields: string[];
}

export interface PlanDiff {
  added: PlanSession[];
  changed: PlanChange[];
  unchanged: number;
  removed: PlanSession[];
  /** Min and max date of the incoming rows; both empty when the CSV has no rows. */
  range: { from: string; to: string };
}

export type DiffScope = "csv-range" | "all";

/** Lowercase, non-alphanumerics collapsed to single hyphens, trimmed. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The stable id a row gets when the CSV leaves `id` blank. */
export function deriveId(date: string, sport: string, title: string): string {
  return `${date}-${sport}-${slug(title)}`;
}

/* ------------------------------------------------------------------ */
/* CSV reading                                                          */
/* ------------------------------------------------------------------ */

interface CsvRecord {
  /** Physical line the record started on, 1-based. */
  line: number;
  fields: string[];
}

/**
 * RFC 4180-style tokenizer. Fields may be quoted; a quoted field may contain
 * commas, CR/LF, and doubled quotes. Both LF and CRLF end a record. A quote
 * that opens mid-field is kept literally (lenient, like spreadsheets).
 */
export function readCsv(text: string): CsvRecord[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let recordHasContent = false;

  const endField = () => {
    fields.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    if (recordHasContent || fields.length > 1) records.push({ line: recordLine, fields });
    fields = [];
    recordHasContent = false;
    recordLine = line;
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n") line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.length === 0) {
      quoted = true;
      recordHasContent = true;
    } else if (ch === ",") {
      endField();
      recordHasContent = true;
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      line += 1;
      endRecord();
    } else if (ch === "\n") {
      line += 1;
      endRecord();
    } else {
      field += ch;
      recordHasContent = true;
    }
  }
  // Flush the last record (no trailing newline) unless it is empty.
  if (recordHasContent || fields.length > 0 || field.length > 0) {
    endField();
    if (recordHasContent) records.push({ line: recordLine, fields });
  }
  return records;
}

/* ------------------------------------------------------------------ */
/* Parsing into PlanSession                                             */
/* ------------------------------------------------------------------ */

type Header = (typeof PLAN_CSV_HEADER)[number];
const REQUIRED: readonly Header[] = ["date", "sport", "title"];

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function blankToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length === 0 ? null : t;
}

/**
 * Parse the admin CSV. Rows that fail validation are reported with the
 * physical line they started on and are left out of `rows`; the rest are
 * returned sorted by date then id. A missing or malformed header is a single
 * error on line 1 and yields no rows.
 */
export function parsePlanCsv(text: string): PlanCsvResult {
  const errors: PlanCsvError[] = [];
  const records = readCsv(text);
  if (records.length === 0) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };

  const [headerRec, ...body] = records;
  const columns = headerRec.fields.map(normaliseHeader);
  const index = new Map<string, number>();
  columns.forEach((c, i) => {
    if (c.length > 0 && !index.has(c)) index.set(c, i);
  });
  const missing = REQUIRED.filter((h) => !index.has(h));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: headerRec.line, message: `Header is missing required column(s): ${missing.join(", ")}. Expected: ${PLAN_CSV_HEADER.join(",")}.` }],
    };
  }
  const unknown = columns.filter((c) => c.length > 0 && !(PLAN_CSV_HEADER as readonly string[]).includes(c));
  if (unknown.length > 0) {
    errors.push({ line: headerRec.line, message: `Unknown column(s) ignored: ${unknown.join(", ")}.` });
  }
  const col = (fields: string[], name: Header): string | undefined => {
    const i = index.get(name);
    return i === undefined ? undefined : fields[i];
  };

  const { from: windowFrom, to: windowTo } = planWindow();
  const rows: PlanSession[] = [];
  const seen = new Map<string, number>();

  for (const rec of body) {
    const f = rec.fields;
    if (f.every((v) => v.trim().length === 0)) continue;
    const problems: string[] = [];

    const date = (col(f, "date") ?? "").trim();
    if (!isISODate(date)) problems.push(`date "${date}" must be YYYY-MM-DD`);
    else if (date < windowFrom || date > windowTo) problems.push(`date ${date} is outside the program (${windowFrom} to ${windowTo})`);

    const sport = (col(f, "sport") ?? "").trim().toLowerCase();
    if (!SPORTS.includes(sport as Sport)) problems.push(`sport "${sport}" must be one of ${SPORTS.join(", ")}`);

    const title = (col(f, "title") ?? "").trim();
    if (title.length === 0) problems.push("title is required");

    const detail = blankToNull(col(f, "detail"));

    let targetMin: number | null = null;
    const minRaw = blankToNull(col(f, "target_min"));
    if (minRaw !== null) {
      const n = Number(minRaw);
      if (!Number.isInteger(n) || n < 0) problems.push(`target_min "${minRaw}" must be a whole number of minutes`);
      else targetMin = n;
    }

    let targetKm: number | null = null;
    const kmRaw = blankToNull(col(f, "target_km"));
    if (kmRaw !== null) {
      const n = Number(kmRaw);
      if (!Number.isFinite(n) || n < 0) problems.push(`target_km "${kmRaw}" must be a number`);
      else targetKm = n;
    }

    const athletes: AthleteSlug[] = [];
    const athletesRaw = blankToNull(col(f, "athletes"));
    if (athletesRaw !== null) {
      for (const part of athletesRaw.split(/[;,]/)) {
        const a = part.trim().toLowerCase();
        if (a.length === 0) continue;
        if (!ATHLETES.includes(a as AthleteSlug)) problems.push(`athlete "${a}" must be one of ${ATHLETES.join(", ")}`);
        else if (!athletes.includes(a as AthleteSlug)) athletes.push(a as AthleteSlug);
      }
    }

    const phase = blankToNull(col(f, "phase"));

    let week = 0;
    const weekRaw = blankToNull(col(f, "week"));
    const weekFromDate = isISODate(date) ? weekOf(date).week : null;
    if (weekRaw === null) {
      if (weekFromDate !== null) week = weekFromDate;
      else problems.push("week is required when the date is invalid");
    } else {
      const n = Number(weekRaw);
      if (!Number.isInteger(n) || n < 1 || n > PLAN_WEEKS) problems.push(`week "${weekRaw}" must be a whole number from 1 to ${PLAN_WEEKS}`);
      else if (weekFromDate !== null && n !== weekFromDate) problems.push(`week ${n} does not match the date: ${date} falls in week ${weekFromDate}`);
      else week = n;
    }

    const idRaw = blankToNull(col(f, "id"));
    const id = idRaw ?? (problems.length === 0 ? deriveId(date, sport, title) : "");
    if (id.length > 0) {
      const dup = seen.get(id);
      if (dup !== undefined) problems.push(`id "${id}" already used on line ${dup}`);
      else seen.set(id, rec.line);
    }

    if (problems.length > 0) {
      errors.push({ line: rec.line, message: problems.join("; ") });
      continue;
    }
    rows.push({ id, date, sport: sport as Sport, title, detail, targetMin, targetKm, athletes, phase, week });
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  errors.sort((a, b) => a.line - b.line);
  return { rows, errors };
}

/* ------------------------------------------------------------------ */
/* Diff                                                                 */
/* ------------------------------------------------------------------ */

const COMPARED: readonly (keyof Omit<PlanSession, "id">)[] = ["date", "sport", "title", "detail", "targetMin", "targetKm", "athletes", "phase", "week"];

/** Normalise one field so trivially different encodings compare equal. */
function norm(key: keyof PlanSession, value: unknown): string {
  if (key === "athletes") {
    const list = Array.isArray(value) ? value : [];
    return [...new Set(list.map((a) => String(a).trim().toLowerCase()).filter((a) => a.length > 0))].sort().join(";");
  }
  if (value === null || value === undefined) return "";
  if (key === "targetMin" || key === "targetKm" || key === "week") {
    const n = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(n) ? String(n) : "";
  }
  return String(value).trim();
}

/** Field names whose normalised values differ between two sessions. */
export function changedFields(before: PlanSession, after: PlanSession): string[] {
  return COMPARED.filter((k) => norm(k, before[k]) !== norm(k, after[k]));
}

/**
 * What applying `incoming` would do to `existing` (the DB). Rows match by id.
 * "csv-range" treats only DB rows inside the CSV's date span as candidates
 * for removal; "all" treats every DB row absent from the CSV as removed.
 */
export function diffPlan(incoming: PlanSession[], existing: PlanSession[], opts: { scope: DiffScope }): PlanDiff {
  let from = "";
  let to = "";
  for (const s of incoming) {
    if (from === "" || s.date < from) from = s.date;
    if (to === "" || s.date > to) to = s.date;
  }

  const byId = new Map(existing.map((s) => [s.id, s] as const));
  const seen = new Set<string>();
  const added: PlanSession[] = [];
  const changed: PlanChange[] = [];
  let unchanged = 0;

  for (const after of incoming) {
    seen.add(after.id);
    const before = byId.get(after.id);
    if (!before) {
      added.push(after);
      continue;
    }
    const fields = changedFields(before, after);
    if (fields.length === 0) unchanged += 1;
    else changed.push({ before, after, fields });
  }

  const removed = existing.filter((s) => {
    if (seen.has(s.id)) return false;
    if (opts.scope === "all") return true;
    return from !== "" && s.date >= from && s.date <= to;
  });

  return { added, changed, unchanged, removed, range: { from, to } };
}

/* ------------------------------------------------------------------ */
/* Apply                                                                */
/* ------------------------------------------------------------------ */

/**
 * Write a diff: upsert added and changed rows, delete removed rows when
 * asked, then revalidate TRAINING_CACHE_TAG so /training picks it up.
 * Server only (loads the Supabase client and next/cache lazily).
 */
export async function applyPlanDiff(diff: PlanDiff, opts: { deleteRemoved: boolean }): Promise<{ added: number; changed: number; removed: number }> {
  const [{ upsertPlanSessions, deletePlanSessions }, { revalidateTag }, { TRAINING_CACHE_TAG }] = await Promise.all([
    import("./plan-db"),
    import("next/cache"),
    import("../training/queries"),
  ]);
  const upserts = [...diff.added, ...diff.changed.map((c) => c.after)];
  if (upserts.length > 0) await upsertPlanSessions(upserts);
  let removed = 0;
  if (opts.deleteRemoved && diff.removed.length > 0) {
    removed = await deletePlanSessions(diff.removed.map((s) => s.id));
  }
  revalidateTag(TRAINING_CACHE_TAG, "max");
  return { added: diff.added.length, changed: diff.changed.length, removed };
}

/* ------------------------------------------------------------------ */
/* Export                                                               */
/* ------------------------------------------------------------------ */

function csvField(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The program as CSV in the import format, one row per session, LF line ends, trailing newline. */
export function exportPlanCsv(rows: PlanSession[]): string {
  const lines = [PLAN_CSV_HEADER.join(",")];
  for (const s of rows) {
    lines.push(
      [s.date, s.sport, s.title, s.detail, s.targetMin, s.targetKm, s.athletes.join(";"), s.phase, s.week, s.id].map(csvField).join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
