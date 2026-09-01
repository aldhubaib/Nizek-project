"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddButton } from "@/components/add-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SprintDocHeaderLeft } from "@/components/project/note-slide-over";
import {
  addClientChatStaff,
  getClientChatRoster,
  removeClientChatStaff,
  type ClientChatPerson,
} from "@/actions/client-chat";

function PersonRow({
  person,
  action,
}: {
  person: ClientChatPerson;
  action?: React.ReactNode;
}) {
  const label = person.name ?? person.email;
  return (
    <div className="flex items-center gap-s py-2">
      {person.imageUrl ? (
        <Image
          src={person.imageUrl}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {label.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-s font-medium text-foreground">
          {label}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {person.kind === "client" ? "Client · auto" : person.email}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ClientChatPeopleManager({
  projectId,
  enabled,
  compact = false,
  clientView = false,
  projectName,
}: {
  projectId: string;
  enabled: boolean;
  /** Tighter layout for the thread side panel */
  compact?: boolean;
  /** Client-facing labels: Nizek team / {project} team */
  clientView?: boolean;
  projectName?: string;
}) {
  const [people, setPeople] = useState<ClientChatPerson[]>([]);
  const [addable, setAddable] = useState<ClientChatPerson[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    if (!enabled) {
      setPeople([]);
      setAddable([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const roster = await getClientChatRoster(projectId);
      setPeople(roster.people);
      setAddable(roster.addableStaff);
      setCanManage(roster.canManage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people");
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!enabled) return null;

  const clients = people.filter((p) => p.kind === "client");
  const staff = people.filter((p) => p.kind === "staff");

  const staffLabel = clientView
    ? "Nizek team"
    : `Your team (${staff.length})`;
  const clientLabel = clientView
    ? `${projectName?.trim() || "Project"} team`
    : `Clients (${clients.length})`;

  const addButton = canManage ? (
    <AddButton
      label="Add staff"
      disabled={pending}
      onClick={() => setAddOpen(true)}
    />
  ) : null;

  return (
    <div className={cn(!compact && "mt-3 space-y-3 border-t border-border/50 pt-3")}>
      {/* Inside a slide-over the plus belongs in the panel header, beside the title. */}
      {compact && addButton ? (
        <SprintDocHeaderLeft>{addButton}</SprintDocHeaderLeft>
      ) : null}

      {!clientView && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-xs text-s font-semibold">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              People in client chat
            </div>
            {!compact && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clients on the project are added automatically. Add staff from your
                side who should talk to the client.
              </p>
            )}
          </div>
          {!compact ? addButton : null}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-s text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <p className="text-s text-destructive">{error}</p>
      ) : (
        <div className={cn("divide-y divide-border/40", compact && "max-h-80 overflow-y-auto")}>
          {staff.length > 0 && (
            <div className="pb-1">
              <div
                className={cn(
                  "py-1 text-xs font-semibold tracking-wide text-muted-foreground",
                  !clientView && "uppercase",
                )}
              >
                {staffLabel}
              </div>
              {staff.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  action={
                    canManage ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={pending}
                        aria-label={`Remove ${p.name ?? p.email}`}
                        onClick={() => {
                          startTransition(async () => {
                            const res = await removeClientChatStaff({
                              projectId,
                              userId: p.id,
                            });
                            if (!res.ok) setError(res.error);
                            else await reload();
                          });
                        }}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
          {clients.length > 0 && (
            <div className="pb-1">
              <div
                className={cn(
                  "py-1 text-xs font-semibold tracking-wide text-muted-foreground",
                  !clientView && "uppercase",
                )}
              >
                {clientLabel}
              </div>
              {clients.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))}
            </div>
          )}
          {people.length === 0 && (
            <p className="py-3 text-s text-muted-foreground">
              No one in this chat yet. Add staff and invite clients to the project.
            </p>
          )}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        {/* The People panel is a slide-over at z-850 — the picker has to clear it. */}
        <DialogContent className="z-[901] sm:max-w-md" overlayClassName="z-[900]">
          <DialogHeader>
            <DialogTitle>Add staff to client chat</DialogTitle>
          </DialogHeader>
          <ul className="max-h-72 divide-y divide-border/40 overflow-y-auto">
            {addable.length === 0 ? (
              <li className="py-6 text-center text-s text-muted-foreground">
                Everyone on the project is already in this chat.
              </li>
            ) : (
              addable.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pending}
                    className="flex w-full items-center gap-s py-2.5 text-start transition-colors hover:bg-surface/60 disabled:opacity-60"
                    onClick={() => {
                      startTransition(async () => {
                        const res = await addClientChatStaff({
                          projectId,
                          userId: p.id,
                        });
                        if (!res.ok) {
                          setError(res.error);
                          return;
                        }
                        await reload();
                        setAddOpen(false);
                      });
                    }}
                  >
                    <PersonRow person={p} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
