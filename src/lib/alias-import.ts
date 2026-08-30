/**
 * Parser for the pasted alias list on Settings → Aliases.
 *
 * Pure and free of Prisma so the admin UI can preview exactly what will be
 * created before anything is written, and so the same parse can be unit tested.
 *
 * Accepted shapes, one alias per line:
 *   Ahmed Al Sabah, male
 *   Ahmed Al Sabah, male, Kuwaiti
 *   Ahmed Al Sabah<TAB>M<TAB>Kuwaiti      (spreadsheet paste)
 *   Ahmed Al Sabah Male Kuwaiti           (plain spaces, no delimiter)
 *
 * Every line has to name a gender, because that is what decides which pool the
 * alias is drawn from — guessing it would hand a client an alias of the wrong
 * gender. Nationality stays optional.
 *
 * First and last names are kept unique across the whole pool, not just per
 * line, so no two aliases share either half of a name.
 */

export type Gender = "MALE" | "FEMALE";

export type ParsedAliasRow = {
  /** 1-based line number in the pasted text, for pointing at problems. */
  line: number;
  name: string;
  gender: Gender;
  nationality: string | null;
};

export type AliasImportIssue = {
  line: number;
  text: string;
  reason: string;
};

export type AliasImportResult = {
  rows: ParsedAliasRow[];
  /** Lines that could not be turned into an alias. */
  issues: AliasImportIssue[];
  /** Lines dropped because that exact alias is already there. */
  duplicates: AliasImportIssue[];
};

export type AliasImportOptions = {
  /**
   * Names already in the pool. Passing them lets the preview reject a clash up
   * front instead of the admin discovering it in the skipped list after saving.
   */
  existingNames?: string[];
};

export const MAX_NAME_LENGTH = 80;
export const MAX_NATIONALITY_LENGTH = 60;

const MALE_TOKENS = new Set(["m", "male", "man", "boy", "ذكر"]);
const FEMALE_TOKENS = new Set(["f", "female", "w", "woman", "girl", "أنثى"]);

/**
 * Only unambiguous whole words are used to find the gender in a line with no
 * delimiter. "M" and "F" are excluded there because a middle initial ("John M
 * Smith") and surnames like "Man" would otherwise be read as the gender column.
 */
const SPACED_GENDER_WORDS = new Set(["male", "female", "ذكر", "أنثى"]);

/** Column separator: tab wins when present so names containing commas survive. */
function splitColumns(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (/[,;]/.test(line)) return line.split(/[,;]/).map((c) => c.trim());
  return splitOnSpaces(line);
}

/**
 * "Ahmed Al Sabah Male Kuwaiti" → ["Ahmed Al Sabah", "Male", "Kuwaiti"].
 *
 * The gender word is the pivot: everything before it is the name and everything
 * after it is the nationality, so both multi-word names and multi-word
 * nationalities ("Saudi Arabian") survive. With no gender word the whole line
 * comes back as the name and the caller reports the missing gender.
 */
function splitOnSpaces(line: string): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  const pivot = words.findIndex((w) => SPACED_GENDER_WORDS.has(w.toLowerCase()));
  if (pivot <= 0) return [line];
  return [
    words.slice(0, pivot).join(" "),
    words[pivot],
    words.slice(pivot + 1).join(" "),
  ];
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * "Fatima Al Ali" → { first: "fatima", last: "ali" }, lowercased for comparison.
 *
 * Middle words are deliberately ignored. The two ends of the name are what a
 * client actually reads and repeats, so those are what has to stay distinct;
 * particles like "Al" or "bin" would otherwise collide on every other row.
 * A one-word name is both its own first and last name.
 */
export function nameKeyParts(name: string): { first: string; last: string } {
  const words = collapseSpaces(name).split(" ").filter(Boolean);
  return {
    first: (words[0] ?? "").toLowerCase(),
    last: (words[words.length - 1] ?? "").toLowerCase(),
  };
}

export function parseGenderToken(token: string): Gender | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (MALE_TOKENS.has(t)) return "MALE";
  if (FEMALE_TOKENS.has(t)) return "FEMALE";
  return null;
}

/** Normalises "  kuwaiti " and "KUWAITI" to one spelling so grouping works. */
export function normalizeNationality(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = collapseSpaces(value);
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .map((word) =>
      word.length <= 1
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

/**
 * Words that only ever appear in a spreadsheet header, never in a person's
 * name. A first line built entirely from these is a header row.
 */
const HEADER_WORDS = new Set([
  "id",
  "no",
  "name",
  "names",
  "full",
  "fullname",
  "first",
  "last",
  "alias",
  "gender",
  "sex",
  "nationality",
  "nationalities",
  "country",
  "origin",
  "photo",
  "image",
  "url",
]);

/**
 * True for "Name, Gender, Nationality" and for "Full Name<TAB>Gender<TAB>Origin".
 * Checked word by word so it works whether or not the row has delimiters.
 */
function isHeaderLine(line: string): boolean {
  const words = line
    .split(/[\t,;\s]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase().replace(/_/g, ""));
  if (words.length === 0) return false;
  return words.every((w) => HEADER_WORDS.has(w));
}

export function parseAliasImport(
  text: string,
  options: AliasImportOptions = {},
): AliasImportResult {
  const rows: ParsedAliasRow[] = [];
  const issues: AliasImportIssue[] = [];
  const duplicates: AliasImportIssue[] = [];
  const seen = new Set<string>();

  // Owner of each first/last name, so a rejection can say who already has it.
  const takenFull = new Set<string>();
  const takenFirst = new Map<string, string>();
  const takenLast = new Map<string, string>();

  for (const existing of options.existingNames ?? []) {
    const cleaned = collapseSpaces(existing);
    if (!cleaned) continue;
    takenFull.add(cleaned.toLowerCase());
    const { first, last } = nameKeyParts(cleaned);
    if (first && !takenFirst.has(first)) takenFirst.set(first, cleaned);
    if (last && !takenLast.has(last)) takenLast.set(last, cleaned);
  }

  const lines = text.split(/\r?\n/);
  let sawContent = false;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    // Only the first content line can be a header, so a later person whose name
    // happens to collide with a header word is still imported.
    if (!sawContent && isHeaderLine(trimmed)) {
      sawContent = true;
      continue;
    }
    sawContent = true;

    const columns = splitColumns(trimmed);

    const name = collapseSpaces(columns[0] ?? "");
    if (!name) {
      issues.push({ line: lineNo, text: trimmed, reason: "No name on this line" });
      continue;
    }
    if (name.length > MAX_NAME_LENGTH) {
      issues.push({
        line: lineNo,
        text: trimmed,
        reason: `Name is longer than ${MAX_NAME_LENGTH} characters`,
      });
      continue;
    }

    const genderToken = columns[1] ?? "";
    if (!genderToken) {
      issues.push({
        line: lineNo,
        text: trimmed,
        reason: "No gender on this line — add male or female after the name",
      });
      continue;
    }
    const gender = parseGenderToken(genderToken);
    if (!gender) {
      issues.push({
        line: lineNo,
        text: trimmed,
        reason: `"${genderToken}" is not a gender — use male or female`,
      });
      continue;
    }

    const nationalityToken = columns[2] ?? "";
    const nationality = nationalityToken
      ? normalizeNationality(nationalityToken)
      : null;
    if (nationality && nationality.length > MAX_NATIONALITY_LENGTH) {
      issues.push({
        line: lineNo,
        text: trimmed,
        reason: `Nationality is longer than ${MAX_NATIONALITY_LENGTH} characters`,
      });
      continue;
    }

    const lower = name.toLowerCase();
    if (seen.has(lower) || takenFull.has(lower)) {
      duplicates.push({
        line: lineNo,
        text: trimmed,
        reason: `"${name}" is already an alias`,
      });
      continue;
    }

    // First and last names are unique across the pool. Two aliases sharing
    // either half give a client something to notice and compare notes on.
    const { first, last } = nameKeyParts(name);
    const firstOwner = takenFirst.get(first);
    if (firstOwner) {
      issues.push({
        line: lineNo,
        text: trimmed,
        reason: `First name is already used by "${firstOwner}"`,
      });
      continue;
    }
    const lastOwner = takenLast.get(last);
    if (lastOwner) {
      issues.push({
        line: lineNo,
        text: trimmed,
        reason: `Last name is already used by "${lastOwner}"`,
      });
      continue;
    }

    seen.add(lower);
    takenFirst.set(first, name);
    takenLast.set(last, name);

    rows.push({ line: lineNo, name, gender, nationality });
  }

  return { rows, issues, duplicates };
}
