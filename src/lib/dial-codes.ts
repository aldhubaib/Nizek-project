// Telephone dialling codes, keyed by the same ISO 3166-1 alpha-2 codes the
// country picker already uses. Names and flags still come from `countries.ts`,
// so only the digits live here.
//
// The Record type is written against COUNTRY_CODES on purpose: adding a country
// there without a dialling code here is a type error rather than a blank in a
// dropdown.

import { COUNTRY_CODES, countryFlag, countryName } from "@/lib/countries";

type CountryCode = (typeof COUNTRY_CODES)[number];

export const DIAL_CODES: Record<CountryCode, string> = {
  AD: "376", AE: "971", AF: "93", AG: "1268", AI: "1264", AL: "355",
  AM: "374", AO: "244", AQ: "672", AR: "54", AS: "1684", AT: "43",
  AU: "61", AW: "297", AX: "358", AZ: "994", BA: "387", BB: "1246",
  BD: "880", BE: "32", BF: "226", BG: "359", BH: "973", BI: "257",
  BJ: "229", BL: "590", BM: "1441", BN: "673", BO: "591", BQ: "599",
  BR: "55", BS: "1242", BT: "975", BV: "47", BW: "267", BY: "375",
  BZ: "501", CA: "1", CC: "61", CD: "243", CF: "236", CG: "242",
  CH: "41", CI: "225", CK: "682", CL: "56", CM: "237", CN: "86",
  CO: "57", CR: "506", CU: "53", CV: "238", CW: "599", CX: "61",
  CY: "357", CZ: "420", DE: "49", DJ: "253", DK: "45", DM: "1767",
  DO: "1809", DZ: "213", EC: "593", EE: "372", EG: "20", EH: "212",
  ER: "291", ES: "34", ET: "251", FI: "358", FJ: "679", FK: "500",
  FM: "691", FO: "298", FR: "33", GA: "241", GB: "44", GD: "1473",
  GE: "995", GF: "594", GG: "44", GH: "233", GI: "350", GL: "299",
  GM: "220", GN: "224", GP: "590", GQ: "240", GR: "30", GS: "500",
  GT: "502", GU: "1671", GW: "245", GY: "592", HK: "852", HM: "672",
  HN: "504", HR: "385", HT: "509", HU: "36", ID: "62", IE: "353",
  IL: "972", IM: "44", IN: "91", IO: "246", IQ: "964", IR: "98",
  IS: "354", IT: "39", JE: "44", JM: "1876", JO: "962", JP: "81",
  KE: "254", KG: "996", KH: "855", KI: "686", KM: "269", KN: "1869",
  KP: "850", KR: "82", KW: "965", KY: "1345", KZ: "7", LA: "856",
  LB: "961", LC: "1758", LI: "423", LK: "94", LR: "231", LS: "266",
  LT: "370", LU: "352", LV: "371", LY: "218", MA: "212", MC: "377",
  MD: "373", ME: "382", MF: "590", MG: "261", MH: "692", MK: "389",
  ML: "223", MM: "95", MN: "976", MO: "853", MP: "1670", MQ: "596",
  MR: "222", MS: "1664", MT: "356", MU: "230", MV: "960", MW: "265",
  MX: "52", MY: "60", MZ: "258", NA: "264", NC: "687", NE: "227",
  NF: "672", NG: "234", NI: "505", NL: "31", NO: "47", NP: "977",
  NR: "674", NU: "683", NZ: "64", OM: "968", PA: "507", PE: "51",
  PF: "689", PG: "675", PH: "63", PK: "92", PL: "48", PM: "508",
  PN: "64", PR: "1787", PS: "970", PT: "351", PW: "680", PY: "595",
  QA: "974", RE: "262", RO: "40", RS: "381", RU: "7", RW: "250",
  SA: "966", SB: "677", SC: "248", SD: "249", SE: "46", SG: "65",
  SH: "290", SI: "386", SJ: "47", SK: "421", SL: "232", SM: "378",
  SN: "221", SO: "252", SR: "597", SS: "211", ST: "239", SV: "503",
  SX: "1721", SY: "963", SZ: "268", TC: "1649", TD: "235", TF: "262",
  TG: "228", TH: "66", TJ: "992", TK: "690", TL: "670", TM: "993",
  TN: "216", TO: "676", TR: "90", TT: "1868", TV: "688", TW: "886",
  TZ: "255", UA: "380", UG: "256", UM: "1", US: "1", UY: "598",
  UZ: "998", VA: "39", VC: "1784", VE: "58", VG: "1284", VI: "1340",
  VN: "84", VU: "678", WF: "681", WS: "685", YE: "967", YT: "262",
  ZA: "27", ZM: "260", ZW: "263",
};

/** Where a phone picker opens before anyone has chosen a country. */
export const DEFAULT_DIAL_COUNTRY = "KW";

export function isDialCountry(code: string): code is CountryCode {
  return Object.prototype.hasOwnProperty.call(DIAL_CODES, code.toUpperCase());
}

/** "KW" → "+965". Empty for a code we don't dial. */
export function dialCode(country: string): string {
  const upper = country.toUpperCase();
  return isDialCountry(upper) ? `+${DIAL_CODES[upper]}` : "";
}

/**
 * The stored pair as one number: "KW" + "50123456" → "+965 50123456".
 *
 * Kept in one place so a row, a `tel:` link and an export never disagree about
 * where the dialling code goes.
 */
export function formatPhone(country: string, number: string): string {
  const code = dialCode(country);
  if (!number) return code;
  return code ? `${code} ${number}` : number;
}

/** The same pair as a dialable href, with the spaces taken back out. */
export function phoneHref(country: string, number: string): string {
  return `tel:${formatPhone(country, number).replace(/\s+/g, "")}`;
}

/**
 * Digits only. Users paste numbers with spaces, dashes and brackets in them,
 * and a leading dialling code they already picked from the dropdown — strip all
 * of it so two people who typed the same number are stored the same way.
 */
export function normalizePhoneNumber(country: string, raw: string): string {
  let digits = raw.replace(/\D/g, "");
  const code = DIAL_CODES[country.toUpperCase() as CountryCode];
  // A pasted "+965 50123456" arrives as "96550123456" against country KW. Drop
  // the prefix only when what remains is still long enough to be a number,
  // so a Kuwaiti line that genuinely starts 965… survives.
  if (code && digits.startsWith(code) && digits.length - code.length >= 6) {
    digits = digits.slice(code.length);
  }
  return digits.replace(/^0+/, "");
}

/** Codes sorted by country name, for the dropdown to list. */
export function dialOptions(): {
  code: CountryCode;
  name: string;
  dial: string;
  flag: string;
}[] {
  return (Object.keys(DIAL_CODES) as CountryCode[])
    .map((code) => ({
      code,
      name: countryName(code),
      dial: `+${DIAL_CODES[code]}`,
      flag: countryFlag(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
