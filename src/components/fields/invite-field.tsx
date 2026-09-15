"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMBOBOX_COLLISION_AVOIDANCE,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MemberAvatar } from "@/components/boards/member-avatar";
import { CountryField } from "@/components/fields/country-field";
import { LocationPicker } from "@/components/fields/location-picker";
import { listWorkflowUsers, type WorkflowUserOption } from "@/actions/workflow";
import { parseCountryCodes, stringifyCountryCodes } from "@/lib/countries";
import {
  addHoursIso,
  attendeeKey,
  countInviteRsvps,
  datetimeLocalToIso,
  isoToDatetimeLocal,
  parseInviteValue,
  stringifyInviteValue,
  type InviteAttendee,
  type InviteAudience,
  type InvitePersonKind,
  type InviteRsvp,
} from "@/lib/fields/invite";
import { cn } from "@/lib/utils";

type Person = {
  kind: InvitePersonKind;
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
};

const RSVP_LABEL: Record<InviteRsvp, string> = {
  needs_action: "Waiting",
  accepted: "Yes",
  tentative: "Maybe",
  declined: "No",
};

function rsvpClass(status: InviteRsvp): string {
  if (status === "accepted") return "text-emerald-400";
  if (status === "declined") return "text-destructive";
  if (status === "tentative") return "text-amber-400";
  return "text-muted-foreground";
}

/** Local wall-clock for datetime-local. Empty on the server so SSR matches. */
function InviteDateTimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (local: string) => void;
}) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    setLocal(isoToDatetimeLocal(value));
  }, [value]);
  return (
    <Input
      type="datetime-local"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

function InviteRsvpSummary({ attendees }: { attendees: InviteAttendee[] }) {
  const { yes, maybe, no, waiting } = countInviteRsvps(attendees);
  const parts: { label: string; count: number; className: string }[] = [
    { label: "Yes", count: yes, className: rsvpClass("accepted") },
    { label: "Maybe", count: maybe, className: rsvpClass("tentative") },
    { label: "No", count: no, className: rsvpClass("declined") },
  ];
  if (waiting > 0) {
    parts.push({
      label: "Waiting",
      count: waiting,
      className: rsvpClass("needs_action"),
    });
  }
  return (
    <span
      className="flex items-center gap-2 text-xs font-medium tabular-nums"
      aria-label={`Yes ${yes}, Maybe ${maybe}, No ${no}${waiting > 0 ? `, Waiting ${waiting}` : ""}`}
    >
      {parts.map((part) => (
        <span key={part.label} className={part.className}>
          {part.label} {part.count}
        </span>
      ))}
    </span>
  );
}

export function InviteField({
  value,
  onChange,
  users,
}: {
  value: string;
  onChange: (next: string) => void;
  users: WorkflowUserOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkflowUserOption[] | null>(
    null,
  );
  const [loadingAll, setLoadingAll] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const invite = parseInviteValue(value);

  useEffect(() => {
    if (invite.audience !== "all" || workspaceUsers) return;
    let cancelled = false;
    setLoadingAll(true);
    void listWorkflowUsers()
      .then((rows) => {
        if (!cancelled) setWorkspaceUsers(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingAll(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invite.audience, workspaceUsers]);

  const directory = invite.audience === "all" && workspaceUsers
    ? workspaceUsers
    : users;

  const people = useMemo<Person[]>(
    () =>
      directory.map((user) => ({
        kind: "user",
        id: user.id,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
      })),
    [directory],
  );

  const knownPeople = useMemo<Person[]>(() => {
    const seen = new Set<string>();
    const rows: Person[] = [];
    for (const user of [...users, ...(workspaceUsers ?? [])]) {
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      rows.push({
        kind: "user",
        id: user.id,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
      });
    }
    return rows;
  }, [users, workspaceUsers]);

  const selectedKeys = new Set(invite.attendees.map(attendeeKey));

  function commit(next: typeof invite) {
    onChange(stringifyInviteValue(next));
  }

  function setStart(local: string) {
    const start = datetimeLocalToIso(local);
    const end =
      invite.end && new Date(invite.end) > new Date(start || 0)
        ? invite.end
        : start
          ? addHoursIso(start, 1)
          : "";
    commit({ ...invite, start, end });
  }

  function setEnd(local: string) {
    commit({ ...invite, end: datetimeLocalToIso(local) });
  }

  function togglePerson(person: Person) {
    const key = attendeeKey(person);
    if (selectedKeys.has(key)) {
      commit({
        ...invite,
        attendees: invite.attendees.filter(
          (row) => attendeeKey(row) !== key,
        ),
      });
      return;
    }
    const attendee: InviteAttendee = {
      kind: person.kind,
      id: person.id,
      status: "needs_action",
      sentAt: null,
    };
    commit({ ...invite, attendees: [...invite.attendees, attendee] });
  }

  function removePerson(attendee: InviteAttendee) {
    commit({
      ...invite,
      attendees: invite.attendees.filter(
        (row) => attendeeKey(row) !== attendeeKey(attendee),
      ),
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (person) =>
        person.name.toLowerCase().includes(q) ||
        person.email.toLowerCase().includes(q),
    );
  }, [people, query]);

  function setAudience(audience: InviteAudience) {
    if (audience === invite.audience) return;
    commit({ ...invite, audience });
  }

  function resolve(attendee: InviteAttendee): Person {
    return (
      knownPeople.find(
        (person) => person.kind === attendee.kind && person.id === attendee.id,
      ) ?? {
        kind: attendee.kind,
        id: attendee.id,
        name: "No longer available",
        email: "",
        imageUrl: null,
      }
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Starts</Label>
          <InviteDateTimeInput value={invite.start} onChange={setStart} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ends</Label>
          <InviteDateTimeInput value={invite.end} onChange={setEnd} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Country</Label>
        <CountryField
          multiple={false}
          value={
            invite.country ? stringifyCountryCodes([invite.country]) : ""
          }
          onChange={(next) => {
            const country = parseCountryCodes(next)[0] ?? "";
            if (country === invite.country) return;
            commit({
              ...invite,
              country,
              location: "",
              lat: null,
              lng: null,
              placeId: "",
            });
          }}
        />
      </div>
      <LocationPicker
        country={invite.country}
        value={{
          location: invite.location,
          lat: invite.lat,
          lng: invite.lng,
          placeId: invite.placeId,
        }}
        onChange={(place) => commit({ ...invite, ...place })}
      />
      <div className="space-y-1.5">
        <Label className="text-xs">Who can be invited</Label>
        <div className="flex h-9 rounded-md border border-input p-0.5">
          {(
            [
              { id: "all", label: "All" },
              { id: "private", label: "Private" },
            ] as const
          ).map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={invite.audience === choice.id}
              onClick={() => setAudience(choice.id)}
              className={cn(
                "flex-1 rounded-sm text-s transition-colors",
                invite.audience === choice.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {invite.audience === "all"
            ? "Everyone in the workspace."
            : "Only people on this project."}
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Attendance</Label>
          {invite.attendees.length > 0 ? (
            <InviteRsvpSummary attendees={invite.attendees} />
          ) : null}
        </div>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery("");
          }}
        >
          <PopoverTrigger
            type="button"
            className="flex min-h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2 py-1.5 text-start dark:bg-input/30"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {invite.attendees.length === 0 ? (
                <span className="text-s text-muted-foreground">
                  Select attendance…
                </span>
              ) : (
                invite.attendees.map((attendee) => {
                  const person = resolve(attendee);
                  return (
                    <span
                      key={attendeeKey(attendee)}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
                    >
                      <MemberAvatar
                        person={{
                          name: person.name,
                          imageUrl: person.imageUrl,
                        }}
                        size="xs"
                      />
                      {person.name}
                      {attendee.sentAt && (
                        <span className={cn("ms-0.5", rsvpClass(attendee.status))}>
                          {RSVP_LABEL[attendee.status]}
                        </span>
                      )}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removePerson(attendee);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          removePerson(attendee);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${person.name}`}
                      >
                        <X className="size-2.5" />
                      </span>
                    </span>
                  );
                })
              )}
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            collisionAvoidance={COMBOBOX_COLLISION_AVOIDANCE}
            className="flex w-80 max-h-[min(20rem,var(--available-height))] flex-col overflow-hidden p-2"
            initialFocus={() => {
              searchRef.current?.focus({ preventScroll: true });
              return false;
            }}
          >
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  invite.audience === "all"
                    ? "Search everyone"
                    : "Search the project"
                }
                className="h-8 ps-8 text-s"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {invite.audience === "all" && loadingAll ? (
                <p className="px-2 py-6 text-center text-s text-muted-foreground">
                  Loading people…
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-s text-muted-foreground">
                  No matches
                </p>
              ) : (
                <ul>
                  {filtered.map((person) => {
                    const on = selectedKeys.has(attendeeKey(person));
                    return (
                      <li key={attendeeKey(person)}>
                        <button
                          type="button"
                          onClick={() => togglePerson(person)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent/60",
                            on && "bg-accent/40",
                          )}
                        >
                          <MemberAvatar
                            person={{
                              name: person.name,
                              imageUrl: person.imageUrl,
                            }}
                            size="sm"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-s">
                              {person.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {person.email}
                            </span>
                          </span>
                          {on && (
                            <Check className="size-3.5 shrink-0 text-foreground" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          Saving does not send. The blueprint Send invite action emails the
          attendance when the record arrives at that stage.
        </p>
      </div>
    </div>
  );
}
