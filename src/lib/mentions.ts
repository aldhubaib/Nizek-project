/** Token id for @all — expanded server-side to every project member. */
export const ALL_MENTION_ID = "__all__";

export const ALL_MENTION_NAME = "all";

export const ALL_MENTION_TOKEN = `@[${ALL_MENTION_NAME}](${ALL_MENTION_ID})`;

/** Match a typed @all mention (not part of an email). */
export const ALL_MENTION_TEXT_RE = /@all\b/g;
