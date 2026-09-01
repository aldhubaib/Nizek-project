// `server-only` exists to fail a client bundle at build time. Tests run in
// node, where there is nothing to guard against, so it resolves to nothing.
export {};
