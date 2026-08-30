import { describe, expect, it } from "vitest";
import {
  nameKeyParts,
  normalizeNationality,
  parseAliasImport,
  parseGenderToken,
} from "@/lib/alias-import";

describe("parseAliasImport", () => {
  it("requires a gender on every line rather than guessing one", () => {
    const res = parseAliasImport("Ahmed Al Sabah\nYousef Khalid");
    expect(res.rows).toEqual([]);
    expect(res.issues.map((i) => i.line)).toEqual([1, 2]);
    expect(res.issues[0].reason).toContain("No gender");
  });

  it("reads the gender each line states", () => {
    const res = parseAliasImport("Ahmed, male\nFatima, female");
    expect(res.rows.map((r) => r.gender)).toEqual(["MALE", "FEMALE"]);
  });

  it("reads name, gender, and nationality columns", () => {
    const res = parseAliasImport("Yousef Khalid, m, kuwaiti");
    expect(res.rows[0]).toMatchObject({
      name: "Yousef Khalid",
      gender: "MALE",
      nationality: "Kuwaiti",
    });
  });

  it("leaves nationality null when a line omits it", () => {
    const res = parseAliasImport("Ahmed, m\nSara, female, Egyptian");
    expect(res.rows.map((r) => r.nationality)).toEqual([null, "Egyptian"]);
  });

  it("prefers tabs so a name containing a comma survives a spreadsheet paste", () => {
    const res = parseAliasImport("Al Sabah, Ahmed\tm\tKuwaiti");
    expect(res.rows[0].name).toBe("Al Sabah, Ahmed");
    expect(res.rows[0].nationality).toBe("Kuwaiti");
  });

  it("skips blank lines and comments without counting them as errors", () => {
    const res = parseAliasImport("Ahmed, m\n\n  \n# a note\n// another\nSara, f");
    expect(res.rows).toHaveLength(2);
    expect(res.issues).toEqual([]);
  });

  it("drops a leading header row", () => {
    const res = parseAliasImport("Name, Gender, Nationality\nAhmed, m");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].name).toBe("Ahmed");
  });

  it("drops the spreadsheet's own header, with or without delimiters", () => {
    for (const header of [
      "Full Name\tGender\tOrigin",
      "Full Name, Gender, Origin",
      "Full Name Gender Origin",
      "ID First Name Last Name Full Name Gender Origin Photo",
    ]) {
      const res = parseAliasImport(`${header}\nAarav Agarwal Male Indian`);
      expect(res.rows, header).toHaveLength(1);
      expect(res.rows[0].name, header).toBe("Aarav Agarwal");
    }
  });

  it("does not mistake a real person named 'Name' mid-list for a header", () => {
    const res = parseAliasImport("Ahmed, m\nName, female");
    expect(res.rows).toHaveLength(2);
  });

  it("still drops a header preceded by blank lines", () => {
    const res = parseAliasImport("\n\nName, Gender\nAhmed, m");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].name).toBe("Ahmed");
  });
});

// The format the pool is actually loaded from: three space-separated columns.
describe("parseAliasImport — space-separated 'Full name Gender Nationality'", () => {
  it("splits name, gender, and nationality on plain spaces", () => {
    const res = parseAliasImport("Ahmed Al Sabah Male Kuwaiti");
    expect(res.issues).toEqual([]);
    expect(res.rows[0]).toMatchObject({
      name: "Ahmed Al Sabah",
      gender: "MALE",
      nationality: "Kuwaiti",
    });
  });

  it("handles a whole pasted block", () => {
    const res = parseAliasImport(
      [
        "Aarav Agarwal Male Indian",
        "Fatima Al Ali Female Pakistani",
        "Ehsan Rahimi Male Iranian",
      ].join("\n"),
    );
    expect(res.issues).toEqual([]);
    expect(res.rows.map((r) => [r.name, r.gender, r.nationality])).toEqual([
      ["Aarav Agarwal", "MALE", "Indian"],
      ["Fatima Al Ali", "FEMALE", "Pakistani"],
      ["Ehsan Rahimi", "MALE", "Iranian"],
    ]);
  });

  it("keeps a multi-word nationality intact", () => {
    const res = parseAliasImport("Mohammed Bin Salman Male Saudi Arabian");
    expect(res.rows[0]).toMatchObject({
      name: "Mohammed Bin Salman",
      gender: "MALE",
      nationality: "Saudi Arabian",
    });
  });

  it("accepts a gender with no nationality after it", () => {
    const res = parseAliasImport("Ahmed Al Sabah Female");
    expect(res.rows[0]).toMatchObject({
      name: "Ahmed Al Sabah",
      gender: "FEMALE",
      nationality: null,
    });
  });

  it("does not read a middle initial as the gender column", () => {
    const res = parseAliasImport("John M Smith Male Indian");
    expect(res.rows[0]).toMatchObject({
      name: "John M Smith",
      gender: "MALE",
      nationality: "Indian",
    });
  });

  it("does not read the surname 'Man' as the gender column", () => {
    const res = parseAliasImport("Wong Man Lee Female Chinese");
    expect(res.rows[0]).toMatchObject({
      name: "Wong Man Lee",
      nationality: "Chinese",
    });
  });

  it("is case-insensitive on the gender word", () => {
    const res = parseAliasImport("Sara Noor FEMALE egyptian");
    expect(res.rows[0]).toMatchObject({
      name: "Sara Noor",
      gender: "FEMALE",
      nationality: "Egyptian",
    });
  });

  it("reports a leading gender word instead of importing an empty name", () => {
    const res = parseAliasImport("Male Ahmed");
    expect(res.rows).toEqual([]);
    expect(res.issues).toHaveLength(1);
  });

  it("reports an unrecognised gender with its line number and keeps going", () => {
    const res = parseAliasImport("Ahmed, m\nSara, other\nYousef, f");
    expect(res.rows).toHaveLength(2);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0].line).toBe(2);
    expect(res.issues[0].reason).toContain("other");
  });

  it("collapses runaway whitespace in a name", () => {
    const res = parseAliasImport("  Ahmed    Al   Sabah  Male  ");
    expect(res.rows[0].name).toBe("Ahmed Al Sabah");
  });

  it("separates duplicates from real errors so the count reads honestly", () => {
    const res = parseAliasImport("Ahmed Khalid, m\nahmed khalid, m\nSara Noor, f");
    expect(res.rows.map((r) => r.name)).toEqual(["Ahmed Khalid", "Sara Noor"]);
    expect(res.duplicates).toHaveLength(1);
    expect(res.issues).toEqual([]);
  });

  it("rejects an over-long name rather than truncating it", () => {
    const res = parseAliasImport(`${"A".repeat(81)}, m`);
    expect(res.rows).toHaveLength(0);
    expect(res.issues[0].reason).toContain("longer than");
  });

  it("returns nothing for empty input", () => {
    const res = parseAliasImport("");
    expect(res.rows).toEqual([]);
    expect(res.issues).toEqual([]);
  });

  it("handles CRLF from a Windows paste", () => {
    const res = parseAliasImport("Ahmed, m\r\nSara, f");
    expect(res.rows.map((r) => r.name)).toEqual(["Ahmed", "Sara"]);
  });
});

// Two aliases sharing either half of a name give a client something to compare.
describe("parseAliasImport — first and last names stay unique", () => {
  it("rejects a later row that repeats a first name", () => {
    const res = parseAliasImport("Ahmed Al Sabah Male\nAhmed Khalid Male");
    expect(res.rows.map((r) => r.name)).toEqual(["Ahmed Al Sabah"]);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0].line).toBe(2);
    expect(res.issues[0].reason).toBe('First name is already used by "Ahmed Al Sabah"');
  });

  it("rejects a later row that repeats a last name", () => {
    const res = parseAliasImport("Fatima Al Ali Female\nSara Al Ali Female");
    expect(res.rows.map((r) => r.name)).toEqual(["Fatima Al Ali"]);
    expect(res.issues[0].reason).toBe('Last name is already used by "Fatima Al Ali"');
  });

  it("ignores middle words, so a shared particle is not a clash", () => {
    const res = parseAliasImport("Fatima Al Ali Female\nSara Al Noor Female");
    expect(res.rows).toHaveLength(2);
    expect(res.issues).toEqual([]);
  });

  it("checks against names already in the pool", () => {
    const res = parseAliasImport("Ahmed Khalid Male\nSara Noor Female", {
      existingNames: ["Ahmed Al Sabah", "Layla Noor"],
    });
    expect(res.rows).toEqual([]);
    expect(res.issues.map((i) => i.reason)).toEqual([
      'First name is already used by "Ahmed Al Sabah"',
      'Last name is already used by "Layla Noor"',
    ]);
  });

  it("reports a name already in the pool as a duplicate, not an error", () => {
    const res = parseAliasImport("Ahmed Al Sabah Male", {
      existingNames: ["ahmed al sabah"],
    });
    expect(res.rows).toEqual([]);
    expect(res.issues).toEqual([]);
    expect(res.duplicates).toHaveLength(1);
  });

  it("compares case- and spacing-insensitively", () => {
    const res = parseAliasImport("AHMED   Khalid Male", {
      existingNames: ["Ahmed Al Sabah"],
    });
    expect(res.issues).toHaveLength(1);
  });

  it("treats a one-word name as both its first and last name", () => {
    const res = parseAliasImport("Ahmed Male\nKhalid Ahmed Male");
    expect(res.rows.map((r) => r.name)).toEqual(["Ahmed"]);
    expect(res.issues[0].reason).toBe('Last name is already used by "Ahmed"');
  });

  it("still accepts a whole batch of distinct names", () => {
    const res = parseAliasImport(
      [
        "Aarav Agarwal Male Indian",
        "Fatima Al Ali Female Pakistani",
        "Ehsan Rahimi Male Iranian",
      ].join("\n"),
    );
    expect(res.rows).toHaveLength(3);
    expect(res.issues).toEqual([]);
  });
});

describe("nameKeyParts", () => {
  it("takes the outer words and lowercases them", () => {
    expect(nameKeyParts("Fatima Al Ali")).toEqual({ first: "fatima", last: "ali" });
    expect(nameKeyParts("  Ahmed   Khalid  ")).toEqual({
      first: "ahmed",
      last: "khalid",
    });
    expect(nameKeyParts("Ahmed")).toEqual({ first: "ahmed", last: "ahmed" });
  });
});

describe("parseGenderToken", () => {
  it("accepts the common spellings and abbreviations", () => {
    for (const t of ["m", "M", "male", "MALE", " Male "]) {
      expect(parseGenderToken(t)).toBe("MALE");
    }
    for (const t of ["f", "female", "FEMALE", "woman"]) {
      expect(parseGenderToken(t)).toBe("FEMALE");
    }
  });

  it("returns null for anything else, including empty", () => {
    expect(parseGenderToken("")).toBeNull();
    expect(parseGenderToken("unknown")).toBeNull();
  });
});

describe("normalizeNationality", () => {
  it("title-cases so one spelling groups together", () => {
    expect(normalizeNationality("kuwaiti")).toBe("Kuwaiti");
    expect(normalizeNationality("KUWAITI")).toBe("Kuwaiti");
    expect(normalizeNationality("  saudi   arabian ")).toBe("Saudi Arabian");
  });

  it("treats blank and missing values as no nationality", () => {
    expect(normalizeNationality("")).toBeNull();
    expect(normalizeNationality("   ")).toBeNull();
    expect(normalizeNationality(null)).toBeNull();
    expect(normalizeNationality(undefined)).toBeNull();
  });
});
