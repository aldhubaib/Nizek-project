"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  ScrollText,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { AddButton } from "@/components/add-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeaderActions } from "@/components/page-header-actions";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { htmlToParagraphs } from "@/lib/note-content-diff";
import {
  discardAgreementDraft,
  getAgreementAcceptances,
  publishAgreementVersion,
  saveAgreementDraft,
  type AgreementAcceptanceView,
  type AgreementAdminView,
  type AgreementPersonDTO,
  type AgreementVersionDTO,
} from "@/actions/client-agreement";

/** Which document is on screen, or null for the list of versions. */
type Open = { kind: "draft" } | { kind: "version"; id: string };

const DRAFT_BADGE = {
  label: "Draft",
  color: "text-orange",
  bg: "bg-background border-orange/30",
};
const LIVE_BADGE = {
  label: "Live",
  color: "text-success",
  bg: "bg-background border-success/30",
};
const SUPERSEDED_BADGE = {
  label: "Published",
  color: "text-muted-foreground",
  bg: "bg-background border-border",
};

export type AgreementFullscreen = { goBack: () => void; title: string } | null;

export function ClientAgreementManager({
  view,
  onFullscreenChange,
}: {
  view: AgreementAdminView;
  /**
   * Lets the admin page swap its header for a back button into the version
   * list, the way the project shell does when a note is open.
   */
  onFullscreenChange?: (doc: AgreementFullscreen) => void;
}) {
  const [open, setOpen] = useState<Open | null>(null);

  const inForce = view.versions[0] ?? null;
  const nextVersion = (inForce?.version ?? 0) + 1;

  const openVersion = open?.kind === "version"
    ? view.versions.find((v) => v.id === open.id) ?? null
    : null;

  const goBack = useCallback(() => setOpen(null), []);

  // An id that stops resolving falls through to the list on its own, because
  // `openVersion` is looked up rather than stored.
  const docTitle = open?.kind === "draft"
    ? `v${nextVersion} draft`
    : openVersion
      ? `v${openVersion.version}`
      : null;

  useEffect(() => {
    if (!docTitle) {
      onFullscreenChange?.(null);
      return;
    }
    onFullscreenChange?.({ goBack, title: docTitle });
  }, [docTitle, goBack, onFullscreenChange]);

  // Leaving the tab entirely has to clear the header too, or the admin page is
  // left showing a back button into a list that is no longer mounted.
  useEffect(() => () => onFullscreenChange?.(null), [onFullscreenChange]);

  if (open?.kind === "draft") {
    return (
      <DraftDocument
        draft={view.draft}
        seedFrom={inForce}
        version={nextVersion}
        onDone={goBack}
      />
    );
  }

  if (openVersion) {
    return (
      <PublishedDocument
        version={openVersion}
        isInForce={openVersion.id === inForce?.id}
      />
    );
  }

  return (
    <VersionList
      view={view}
      nextVersion={nextVersion}
      onOpen={setOpen}
    />
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

function VersionList({
  view,
  nextVersion,
  onOpen,
}: {
  view: AgreementAdminView;
  nextVersion: number;
  onOpen: (open: Open) => void;
}) {
  const { draft, versions, clientCount } = view;
  const empty = !draft && versions.length === 0;

  return (
    <div className="space-y-4">
      {/*
        Only one draft can exist at a time, so when there is one this opens it
        rather than being disabled: the button's job is to get you somewhere you
        can write the next version, and that draft is that place.
      */}
      <PageHeaderActions>
        <AddButton
          className="size-7 rounded-md"
          label={draft ? "Continue the draft" : "New version"}
          onClick={() => onOpen({ kind: "draft" })}
        />
      </PageHeaderActions>

      <div>
        <h2 className="flex items-center gap-2 text-s font-semibold">
          <ScrollText className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          Client agreement
        </h2>
        <p className="mt-1 text-s text-muted-foreground">
          One document every client must read to the end and accept before they can
          reach their chat. Publishing a new version asks all of them again — the
          version they accepted before stays on record. Staff are never asked.
        </p>
      </div>

      {empty ? (
        <p className="rounded-lg border border-border/60 bg-card px-4 py-6 text-s text-muted-foreground">
          Nothing published yet, so no client is being asked to accept anything. Use
          the button in the top right to write the first version.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-s sm:[grid-template-columns:repeat(auto-fill,minmax(15.75rem,1fr))]">
          {draft && (
            <DocumentCard
              badge={DRAFT_BADGE}
              version={nextVersion}
              title={draft.title}
              content={draft.content}
              footer={`Saved ${format(new Date(draft.updatedAt), "MMM d, yyyy")}`}
              onClick={() => onOpen({ kind: "draft" })}
            />
          )}
          {versions.map((v, i) => (
            <DocumentCard
              key={v.id}
              badge={i === 0 ? LIVE_BADGE : SUPERSEDED_BADGE}
              version={v.version}
              title={v.title}
              content={v.content}
              footer={format(new Date(v.publishedAt), "MMM d, yyyy")}
              meta={
                i === 0
                  ? `${v.acceptedCount} of ${clientCount} agreed`
                  : `${v.acceptedCount} agreed`
              }
              onClick={() => onOpen({ kind: "version", id: v.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  badge,
  version,
  title,
  content,
  footer,
  meta,
  onClick,
}: {
  badge: { label: string; color: string; bg: string };
  version: number;
  title: string;
  content: string;
  footer: string;
  meta?: string;
  onClick: () => void;
}) {
  const preview = useMemo(() => htmlToParagraphs(content).join(" "), [content]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-3 text-start transition-colors hover:border-border"
    >
      <div className="flex items-start justify-between gap-2">
        <StatusBadge config={badge} />
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          v{version}
        </span>
      </div>

      <h3 className="mt-2.5 line-clamp-4 text-s font-bold leading-snug">{title}</h3>

      {preview ? (
        <div className="relative mt-2 min-h-0 flex-1 overflow-hidden">
          <p className="text-s leading-relaxed text-muted-foreground">{preview}</p>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
        </div>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div className="mt-auto shrink-0 pt-3">
        <p className="text-xs text-muted-foreground">{footer}</p>
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
      </div>
    </div>
  );
}

// ─── Document shell ──────────────────────────────────────────────────────────

/** Same centred column the notes use, so a version reads like a document. */
function DocumentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-background">
      <div className="mx-auto w-full max-w-4xl px-app py-6 sm:py-10 lg:px-16">
        {children}
      </div>
    </div>
  );
}

// ─── Draft ───────────────────────────────────────────────────────────────────

function DraftDocument({
  draft,
  seedFrom,
  version,
  onDone,
}: {
  draft: AgreementAdminView["draft"];
  seedFrom: AgreementVersionDTO | null;
  version: number;
  onDone: () => void;
}) {
  const router = useRouter();
  // A brand new version opens as a copy of the live text, so writing one is an
  // edit of what clients last agreed to rather than a blank page.
  const [title, setTitle] = useState(draft?.title ?? seedFrom?.title ?? "Client agreement");
  const [content, setContent] = useState(draft?.content ?? seedFrom?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeaderActions>
        <div className="flex items-center gap-2">
          {saved && !busy && (
            <span className="text-s text-muted-foreground">Saved</span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !title.trim()}
            onClick={() =>
              void run(async () => {
                await saveAgreementDraft({ title, content });
                setSaved(true);
              })
            }
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            Publish
          </Button>
        </div>
      </PageHeaderActions>

      {draft && (
        <PageOverflowItems id="agreement-draft" order={0}>
          <DropdownMenuItem
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await discardAgreementDraft();
                onDone();
              })
            }
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1">Discard draft</span>
          </DropdownMenuItem>
        </PageOverflowItems>
      )}

      <DocumentShell>
        <div className="mb-6 flex items-center gap-2">
          <StatusBadge config={DRAFT_BADGE} icon={Pencil} />
          <span className="font-mono text-s text-muted-foreground">v{version}</span>
          <span className="text-s text-muted-foreground">not visible to clients</span>
        </div>

        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaved(false);
          }}
          placeholder="Title..."
          className="mb-4 w-full border-none bg-transparent text-m font-bold outline-none placeholder:text-muted-foreground/30"
          autoFocus
        />

        {error && <p className="mb-4 text-s text-destructive">{error}</p>}

        {/*
          The note editor, so the agreement is written at the size clients read
          it at — plus the toolbar, because an admin writing a legal document
          should not have to know about the slash menu to make a heading.
        */}
        <RichTextEditor
          content={content}
          onChange={(html) => {
            setContent(html);
            setSaved(false);
          }}
          placeholder="Write the agreement… (type / for commands)"
          borderless
          toolbar
        />
      </DocumentShell>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange" strokeWidth={1.5} />
              Publish v{version}?
            </DialogTitle>
            <DialogDescription>
              Every client will be asked to read and accept it before they can get back
              into their chat, including anyone who accepted an earlier version. Once
              published the text cannot be edited — changing it again means another
              version.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  // Save first, so publishing cannot ship a stale draft when
                  // the editor has unsaved edits in it.
                  await saveAgreementDraft({ title, content });
                  await publishAgreementVersion();
                  setConfirming(false);
                  onDone();
                })
              }
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Publish
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Published ───────────────────────────────────────────────────────────────

function PublishedDocument({
  version,
  isInForce,
}: {
  version: AgreementVersionDTO;
  isInForce: boolean;
}) {
  const [agreedOpen, setAgreedOpen] = useState(false);

  return (
    <>
      <PageOverflowItems id="agreement-version" order={0}>
        <DropdownMenuItem onClick={() => setAgreedOpen(true)}>
          <Users className="h-4 w-4" />
          <span className="flex-1">Who has agreed</span>
        </DropdownMenuItem>
      </PageOverflowItems>

      <DocumentShell>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <StatusBadge config={isInForce ? LIVE_BADGE : SUPERSEDED_BADGE} icon={Check} />
          <span className="font-mono text-s text-muted-foreground">
            v{version.version}
          </span>
          <span className="text-s text-muted-foreground">
            published {format(new Date(version.publishedAt), "d MMM yyyy")}
          </span>
        </div>

        <h1 className="mb-4 text-m font-bold">{version.title}</h1>

        <RichTextEditor
          content={version.content}
          onChange={() => {}}
          editable={false}
          borderless
        />
      </DocumentShell>

      <AgreedDialog
        versionId={version.id}
        version={version.version}
        open={agreedOpen}
        onOpenChange={setAgreedOpen}
      />
    </>
  );
}

// ─── Who has agreed ──────────────────────────────────────────────────────────

function AgreedDialog({
  versionId,
  version,
  open,
  onOpenChange,
}: {
  versionId: string;
  version: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            Who has agreed
          </DialogTitle>
          <DialogDescription>
            Everyone who has accepted v{version}, and when they did.
          </DialogDescription>
        </DialogHeader>

        {/*
          Mounted with the dialog so each open re-reads the list rather than
          showing a cached one — somebody accepting is the whole reason an admin
          opens this.
        */}
        {open && <AgreedList versionId={versionId} />}
      </DialogContent>
    </Dialog>
  );
}

function AgreedList({ versionId }: { versionId: string }) {
  const [data, setData] = useState<AgreementAcceptanceView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAgreementAcceptances(versionId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load who has agreed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  if (error) return <p className="text-s text-destructive">{error}</p>;

  if (!data) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (data.accepted.length === 0 && data.pending.length === 0) {
    return (
      <p className="text-s text-muted-foreground">
        There are no clients on the system yet.
      </p>
    );
  }

  return (
    <div className="max-h-[60vh] space-y-4 overflow-y-auto">
      {data.accepted.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-s text-muted-foreground">
            Agreed
            {data.isInForce &&
              ` — ${data.accepted.length} of ${data.accepted.length + data.pending.length}`}
          </p>
          {data.accepted.map((p) => (
            <PersonRow key={p.userId} person={p} />
          ))}
        </div>
      )}

      {data.pending.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-s text-muted-foreground">
            Still to accept — they will be asked next time they open the app.
          </p>
          {data.pending.map((p) => (
            <PersonRow key={p.userId} person={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: AgreementPersonDTO }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-field px-3 py-2">
      <Avatar size="sm" className="shrink-0">
        <AvatarImage src={person.userImageUrl ?? undefined} alt="" />
        <AvatarFallback>
          {(person.userName || "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-s text-foreground">
        {person.userName}
      </span>
      {person.acceptedAt ? (
        <span
          className="shrink-0 font-mono text-s text-muted-foreground"
          title={format(new Date(person.acceptedAt), "PPpp")}
        >
          {format(new Date(person.acceptedAt), "d MMM yyyy, HH:mm")}
        </span>
      ) : (
        <span className="shrink-0 text-s text-orange">Not yet</span>
      )}
    </div>
  );
}
