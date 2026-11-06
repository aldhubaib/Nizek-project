"use client";

import * as React from "react";
import { format } from "date-fns";
import { ImageUp, Pencil, Plus, Trash2 } from "lucide-react";

import {
  PROOF_VIDEO_MODES,
  PROOF_VIDEO_MODE_HINT,
  PROOF_VIDEO_MODE_LABEL,
  type ProofVideoMode,
} from "@/lib/proof-video-mode";
import { Chip, ChipList, Fact, RecordMenu } from "@/next-ui/blocks";
import { useSetProjectKanban } from "@/next-ui/data/kanban";
import {
  kanbanOn,
  proofVideoModeOf,
  useProjectRoles,
  useSetProjectClientChat,
  useSetProjectSprints,
  useSetProofUploaders,
  useSetProofVideoMode,
  useTeams,
  useUpdateProject,
  useUploadProjectLogo,
  type ProjectDetail,
  type ProjectRole,
} from "@/next-ui/data/projects";
import { cn } from "@/next-ui/lib/cn";
import { ProjectAvatar } from "@/next-ui/patterns/project-avatar";
import { Button } from "@/next-ui/ui/button";
import { Checkbox } from "@/next-ui/ui/checkbox";
import { DropdownMenuItem } from "@/next-ui/ui/dropdown-menu";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";
import { Skeleton } from "@/next-ui/ui/skeleton";
import { Switch } from "@/next-ui/ui/switch";
import { Textarea } from "@/next-ui/ui/textarea";

import { DeleteRoleDialog, RoleDialog } from "./role-dialog";

/**
 * The project's settings: what it is called, which team runs it, which ways of working it uses
 * (sprints, Kanban, client chat), its own roles, and when it was made. Each group is one box on
 * the same surface as the project rows. An admin or project manager (`canEdit`) edits the General
 * box and flips the switches, through the same actions the live panel calls; anyone else
 * reads. A project admin (`canEditRoles`) adds, edits and deletes the roles.
 */
export function SettingsView({ project: p, canEdit = false, canEditRoles = false }: { project: ProjectDetail; canEdit?: boolean; canEditRoles?: boolean }) {
  return (
    <div className="flex flex-col gap-4" data-testid="settings-groups" data-editable={canEdit || undefined}>
      {canEdit ? (
        <>
          <GeneralForm project={p} />
          <SystemsForm project={p} />
          {p.sprintsEnabled !== false && <VideoBypassForm project={p} />}
        </>
      ) : (
        <>
          <SettingsGroup title="General" testId="settings-general">
            <dl>
              <FactRow label="Logo" center>
                <ProjectAvatar name={p.name} logoUrl={p.logoUrl} className="size-8" />
              </FactRow>
              <FactRow label="Name">{p.name}</FactRow>
              <FactRow label="Description">{p.description?.trim() || <Muted>None</Muted>}</FactRow>
              <FactRow label="Team">{p.team?.name ?? <Muted>No team</Muted>}</FactRow>
            </dl>
          </SettingsGroup>

          <SettingsGroup title="Ways of working" testId="settings-systems">
            <dl>
              <FactRow label="Sprints">{p.sprintsEnabled !== false ? "On" : "Off"}</FactRow>
              <FactRow label="Kanban">{kanbanOn(p) ? "On" : "Off"}</FactRow>
              <FactRow label="Client chat">{p.clientChatEnabled ? "On" : "Off"}</FactRow>
            </dl>
          </SettingsGroup>

          {p.sprintsEnabled !== false && (
            <SettingsGroup title="Video bypass" testId="settings-video-bypass">
              <dl>
                <FactRow label="Rule">{PROOF_VIDEO_MODE_LABEL[proofVideoModeOf(p)]}</FactRow>
                {proofVideoModeOf(p) === "ASSIGNED" && (
                  <FactRow label="Uploads for others">
                    {uploaderNames(p).length > 0 ? uploaderNames(p).join(", ") : <Muted>Nobody yet</Muted>}
                  </FactRow>
                )}
              </dl>
            </SettingsGroup>
          )}
        </>
      )}

      <RolesGroup projectId={p.id} canEdit={canEditRoles} />

      <SettingsGroup title="Dates" testId="settings-dates">
        <dl>
          <FactRow label="Created">{format(new Date(p.createdAt), "d MMM yyyy")}</FactRow>
          <FactRow label="Last changed">{format(new Date(p.updatedAt), "d MMM yyyy")}</FactRow>
        </dl>
      </SettingsGroup>
    </div>
  );
}

const NO_TEAM = "none";

interface GeneralDraft {
  name: string;
  description: string;
  teamId: string;
}

const same = (a: GeneralDraft, b: GeneralDraft) => a.name === b.name && a.description === b.description && a.teamId === b.teamId;

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

/** A label on the start side and a control on the end side; below `@md` the control drops under the label. */
function FieldRow({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b py-3 last:border-b-0 @md:flex-row @md:items-start @md:gap-6">
      <div className="flex shrink-0 flex-col gap-0.5 @md:w-40 @md:pt-1.5">
        <Label htmlFor={htmlFor} className="text-sm text-muted-foreground">
          {label}
        </Label>
        {hint && <span className="text-xs text-muted-foreground/80">{hint}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 @md:max-w-md">{children}</div>
    </div>
  );
}

/**
 * The General box as a form: the logo changes or goes at once (an image under 512 KB, sent to
 * storage from the browser); name, description and team are typed and saved together with
 * "Save changes", which shows once something differs from what is stored.
 */
function GeneralForm({ project: p }: { project: ProjectDetail }) {
  const update = useUpdateProject(p.id);
  const uploadLogo = useUploadProjectLogo(p.id);
  const teams = useTeams();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const stored = React.useMemo(
    () => ({ name: p.name, description: p.description ?? "", teamId: p.team?.id ?? NO_TEAM }),
    [p.name, p.description, p.team?.id],
  );
  const [draft, setDraft] = React.useState(stored);
  const [base, setBase] = React.useState(stored);
  // a change made elsewhere (or a refetch) moves the stored values: a draft nobody touched follows them
  if (base !== stored) {
    setBase(stored);
    setDraft((d) => (same(d, base) ? stored : d));
  }
  const [error, setError] = React.useState<string | null>(null);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const dirty = !same(draft, stored);
  const canSave = dirty && draft.name.trim() !== "" && !update.isPending;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    const next = { name: draft.name.trim(), description: draft.description.trim(), teamId: draft.teamId };
    update.mutate(
      {
        ...(next.name !== stored.name && { name: next.name }),
        ...(next.description !== stored.description && { description: next.description }),
        ...(next.teamId !== stored.teamId && { teamId: next.teamId === NO_TEAM ? null : next.teamId }),
      },
      {
        // runs once the fresh record is in (the mutation waits for it): the draft is what is stored now
        onSuccess: () => setDraft(next),
        onError: (err) => setError(err instanceof Error ? err.message : "Could not save the changes."),
      },
    );
  };
  const sendLogo = (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    uploadLogo.mutate(file, { onError: (err) => setLogoError(err instanceof Error ? err.message : "Could not upload the logo.") });
  };
  const removeLogo = () => {
    setLogoError(null);
    update.mutate({ logoUrl: null }, { onError: (err) => setLogoError(err instanceof Error ? err.message : "Could not remove the logo.") });
  };

  return (
    <SettingsGroup title="General" testId="settings-general">
      <form onSubmit={save} data-testid="settings-general-form">
        <FieldRow label="Logo" hint="Square, under 512 KB">
          <div className="flex items-center gap-3">
            <ProjectAvatar name={p.name} logoUrl={p.logoUrl} className="size-12" />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadLogo.isPending} data-testid="logo-change">
              <ImageUp />
              {uploadLogo.isPending ? "Uploading…" : p.logoUrl ? "Change" : "Upload"}
            </Button>
            {p.logoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={removeLogo} disabled={update.isPending} data-testid="logo-remove">
                <Trash2 />
                Remove
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose a logo"
              onChange={(e) => {
                sendLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {logoError && <ErrorNote>{logoError}</ErrorNote>}
        </FieldRow>
        <FieldRow label="Name" htmlFor="project-name">
          <Input id="project-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={120} />
        </FieldRow>
        <FieldRow label="Description" htmlFor="project-description" hint="What the project is, in a line or two">
          <Textarea
            id="project-description"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={3}
            placeholder="None yet"
          />
        </FieldRow>
        <FieldRow label="Team" htmlFor="project-team" hint="Who runs it">
          {teams.isPending ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select value={draft.teamId} onValueChange={(v) => setDraft({ ...draft, teamId: v })} disabled={Boolean(teams.error)}>
              <SelectTrigger id="project-team" className="w-full" data-testid="team-select">
                <SelectValue placeholder="Choose a team" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={NO_TEAM}>No team</SelectItem>
                {(teams.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
                {teams.error && p.team && <SelectItem value={p.team.id}>{p.team.name}</SelectItem>}
              </SelectContent>
            </Select>
          )}
        </FieldRow>
        {(dirty || error) && (
          <div className="flex flex-col gap-2 border-t py-3">
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(stored)} disabled={update.isPending}>
                Discard
              </Button>
              <Button type="submit" size="sm" disabled={!canSave} data-testid="settings-save">
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </SettingsGroup>
  );
}

/**
 * The three switches, each saved the moment it is flipped; a refusal (the last of sprints and
 * Kanban cannot go off) is said under the row. Kanban on for the first time makes the
 * project's board: To do, In progress, Completed, and one kind of task.
 */
function SystemsForm({ project: p }: { project: ProjectDetail }) {
  const sprints = useSetProjectSprints(p.id);
  const kanban = useSetProjectKanban(p.id);
  const chat = useSetProjectClientChat(p.id);
  const [sprintsError, setSprintsError] = React.useState<string | null>(null);
  const [kanbanError, setKanbanError] = React.useState<string | null>(null);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const sprintsOn = sprints.isPending && sprints.variables !== undefined ? sprints.variables : p.sprintsEnabled !== false;
  const kanbanIsOn = kanban.isPending && kanban.variables !== undefined ? kanban.variables : kanbanOn(p);
  const chatOn = chat.isPending && chat.variables !== undefined ? chat.variables : Boolean(p.clientChatEnabled);

  return (
    <SettingsGroup title="Ways of working" testId="settings-systems">
      <SwitchRow
        id="project-sprints"
        label="Sprints"
        hint="Road map, active sprint and notes"
        checked={sprintsOn}
        disabled={sprints.isPending}
        error={sprintsError}
        onChange={(on) => {
          setSprintsError(null);
          sprints.mutate(on, { onError: (err) => setSprintsError(err instanceof Error ? err.message : "Could not change it.") });
        }}
      />
      <SwitchRow
        id="project-kanban"
        label="Kanban"
        hint="To do, In progress, Completed — tasks with a title and a description"
        checked={kanbanIsOn}
        disabled={kanban.isPending}
        error={kanbanError}
        onChange={(on) => {
          setKanbanError(null);
          kanban.mutate(on, { onError: (err) => setKanbanError(err instanceof Error ? err.message : "Could not change it.") });
        }}
      />
      <SwitchRow
        id="project-client-chat"
        label="Client chat"
        hint="A conversation with the project's clients"
        checked={chatOn}
        disabled={chat.isPending}
        error={chatError}
        onChange={(on) => {
          setChatError(null);
          chat.mutate(on, { onError: (err) => setChatError(err instanceof Error ? err.message : "Could not change it.") });
        }}
      />
    </SettingsGroup>
  );
}

/** The project's staff members (clients never upload for others), in name order. */
function uploaderCandidates(p: ProjectDetail) {
  return p.members
    .filter((m) => m.role !== "CLIENT" && !m.projectRole?.isClient)
    .map((m) => ({ id: m.id, name: m.user.name ?? m.user.email, role: m.projectRole?.name ?? null, on: m.canBypassProof }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function uploaderNames(p: ProjectDetail) {
  return uploaderCandidates(p).filter((m) => m.on).map((m) => m.name);
}

/**
 * The "Video bypass" rule: how a task proves its work before Internal Review. One choice of
 * three, saved as it is picked; "Assign" opens the list of staff who upload for others, each
 * ticked on or off and saved at once.
 */
function VideoBypassForm({ project: p }: { project: ProjectDetail }) {
  const setMode = useSetProofVideoMode(p.id);
  const setUploaders = useSetProofUploaders(p.id);
  const [modeError, setModeError] = React.useState<string | null>(null);
  const [uploaderError, setUploaderError] = React.useState<string | null>(null);
  const mode = setMode.isPending && setMode.variables !== undefined ? setMode.variables : proofVideoModeOf(p);
  const candidates = uploaderCandidates(p);
  const storedIds = candidates.filter((m) => m.on).map((m) => m.id);
  const chosenIds = setUploaders.isPending && setUploaders.variables !== undefined ? setUploaders.variables : storedIds;

  return (
    <SettingsGroup title="Video bypass" testId="settings-video-bypass">
      <div className="flex flex-col gap-2 border-b py-3 last:border-b-0">
        <div className="flex items-center justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor="project-video-mode" className="text-sm text-muted-foreground">
              Rule
            </Label>
            <span className="text-xs text-muted-foreground/80">{PROOF_VIDEO_MODE_HINT[mode]}</span>
          </div>
          <Select
            value={mode}
            disabled={setMode.isPending}
            onValueChange={(v) => {
              setModeError(null);
              setMode.mutate(v as ProofVideoMode, {
                onError: (err) => setModeError(err instanceof Error ? err.message : "Could not change it."),
              });
            }}
          >
            <SelectTrigger id="project-video-mode" className="w-40 shrink-0" data-testid="video-mode-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {PROOF_VIDEO_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {PROOF_VIDEO_MODE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {modeError && <ErrorNote>{modeError}</ErrorNote>}
      </div>

      {mode === "ASSIGNED" && (
        <div className="flex flex-col gap-2 py-3" data-testid="video-uploaders">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">Uploads for others</span>
            <span className="text-xs text-muted-foreground/80">
              They get each request in their inbox and the project chat. Admins can always upload too.
            </span>
          </div>
          {candidates.length === 0 ? (
            <Muted>No staff members on this project yet.</Muted>
          ) : (
            <ul className="flex flex-col">
              {candidates.map((m) => {
                const id = `uploader-${m.id}`;
                const on = chosenIds.includes(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-3 py-1.5">
                    <Checkbox
                      id={id}
                      checked={on}
                      disabled={setUploaders.isPending}
                      onCheckedChange={(next) => {
                        setUploaderError(null);
                        const ids = next === true ? [...new Set([...chosenIds, m.id])] : chosenIds.filter((x) => x !== m.id);
                        setUploaders.mutate(ids, {
                          onError: (err) => setUploaderError(err instanceof Error ? err.message : "Could not change it."),
                        });
                      }}
                    />
                    <Label htmlFor={id} className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-normal">
                      <span className="truncate">{m.name}</span>
                      {m.role && <span className="truncate text-xs text-muted-foreground">{m.role}</span>}
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
          {chosenIds.length === 0 && candidates.length > 0 && (
            <span className="text-xs text-muted-foreground/80">Nobody is assigned yet, so tasks cannot be handed over until someone is.</span>
          )}
          {uploaderError && <ErrorNote>{uploaderError}</ErrorNote>}
        </div>
      )}
    </SettingsGroup>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  error: string | null;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor={id} className="text-sm text-muted-foreground">
            {label}
          </Label>
          {hint && <span className="text-xs text-muted-foreground/80">{hint}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground" aria-hidden>
            {checked ? "On" : "Off"}
          </span>
          <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} data-testid={`${id}-switch`} />
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/**
 * One group of settings in a box: a title strip (with an optional muted count) and the rows
 * divided by hairlines. Same surface as a `RecordRow`.
 */
function SettingsGroup({
  title,
  meta,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  meta?: React.ReactNode;
  /** The group's own button, on the end side of its header. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-xl border bg-card text-card-foreground", className)}
      aria-label={title}
      data-testid={testId ?? "settings-group"}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        {meta != null && <span className="truncate text-sm text-muted-foreground">· {meta}</span>}
        {action && <span className="ms-auto -my-1 flex items-center">{action}</span>}
      </header>
      <div className="px-4">{children}</div>
    </section>
  );
}

/**
 * This project's roles: each one with what marks it (Admin, Chat only, Team lead) and how many
 * members hold it. The project started with a copy of the presets; a project admin adds a
 * role here, edits one from its ⋯ (name, rights, the stage grid) or deletes it.
 */
function RolesGroup({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const roles = useProjectRoles(projectId);
  const list = roles.data ?? [];
  const [dialog, setDialog] = React.useState<null | { kind: "new" } | { kind: "edit" | "delete"; role: ProjectRole }>(null);
  return (
    <SettingsGroup
      title="Roles"
      meta={roles.data ? list.length : undefined}
      action={
        canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: "new" })} data-testid="new-role-button">
            <Plus />
            New role
          </Button>
        )
      }
      testId="settings-roles"
    >
      {roles.data ? (
        list.length === 0 ? (
          <p className="py-3 text-sm">
            <Muted>No roles yet.</Muted>
          </p>
        ) : (
          <ul className="flex flex-col" data-testid="settings-roles-list">
            {list.map((r) => (
              <RoleRow
                key={r.id}
                role={r}
                menu={
                  canEdit && (
                    <RecordMenu label="Role options" contentClassName="min-w-40">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", role: r })} data-testid="edit-role">
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      {!r.isAdmin && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete", role: r })} data-testid="delete-role">
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </RecordMenu>
                  )
                }
              />
            ))}
          </ul>
        )
      ) : roles.isError ? (
        <p className="py-3 text-sm">
          <Muted>Could not load the roles.</Muted>
        </p>
      ) : (
        <div className="flex flex-col gap-3 py-3" aria-busy="true">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      )}
      <RoleDialog projectId={projectId} role={dialog?.kind === "edit" ? dialog.role : null} open={dialog?.kind === "new" || dialog?.kind === "edit"} onClose={() => setDialog(null)} />
      <DeleteRoleDialog projectId={projectId} role={dialog?.kind === "delete" ? dialog.role : null} open={dialog?.kind === "delete"} onClose={() => setDialog(null)} />
    </SettingsGroup>
  );
}

function RoleRow({ role: r, menu }: { role: ProjectRole; menu?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0" data-testid="settings-role">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm" dir="auto">
          {r.name}
        </span>
        <ChipList dense>
          {r.isAdmin && <Chip variant="secondary">Admin</Chip>}
          {r.isClient && <Chip>Chat only</Chip>}
          {r.isTeamLead && <Chip>Team lead</Chip>}
        </ChipList>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <Fact label="Members">{r._count.members}</Fact>
        {menu}
      </span>
    </li>
  );
}

/** A label on the start side, its value on the end side. `center` for values taller than a line (the logo). */
function FactRow({ label, center, children }: { label: string; center?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex justify-between gap-6 border-b py-3 last:border-b-0", center ? "items-center" : "items-start")}>
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end text-sm break-words" dir="auto">
        {children}
      </dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
