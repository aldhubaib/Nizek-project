"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";

type Person = { email: string; name: string };

/**
 * Shown only when this panel is the local one. The server returns 404
 * everywhere else, including staging. Pick any local account so a browser
 * can message the phone, which stays signed in as the configured person.
 */
export function LocalDevSignIn() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authClient
      .$fetch<{ email?: string; people?: Person[] }>("/dev-sign-in")
      .then((result) => {
        if (cancelled || result.error || !result.data?.email) return;
        const list = result.data.people?.length
          ? result.data.people
          : [{ email: result.data.email, name: result.data.email }];
        setPeople(list);
        setEmail(result.data.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!people || !email) return null;

  const selected = people.find((person) => person.email === email) ?? people[0];

  const signIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.$fetch("/dev-sign-in", {
        method: "POST",
        body: { email: selected.email },
      });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed. Please try again.");
        setLoading(false);
        return;
      }
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <select
        value={selected.email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={loading}
        aria-label="Local account"
        className="h-12 w-full rounded-xl border border-white/10 bg-black px-3 text-s text-white disabled:opacity-60"
      >
        {people.map((person) => (
          <option key={person.email} value={person.email}>
            {person.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-s font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {loading ? "Signing in…" : `Continue as ${selected.name}`}
      </button>
      <p className="text-s text-white/40">This computer only. Google stays required everywhere else.</p>
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-s text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
