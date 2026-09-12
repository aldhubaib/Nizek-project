"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AddButton } from "@/components/add-button";
import { PageHeader, PageName } from "@/components/page-header";
import { ContactBoard } from "@/components/contacts/contact-board";
import { ContactEditorDialog } from "@/components/contacts/contact-editor-dialog";
import { deleteContact, type ContactDTO } from "@/actions/contact";
import {
  createContactStage,
  deleteContactStage,
  moveContactToStage,
  reorderContactStages,
  updateContactStage,
  type ContactStageDTO,
} from "@/actions/contact-stage";
import type { CompanyOption } from "@/actions/company";
import { formatPhone } from "@/lib/dial-codes";

function matches(c: ContactDTO, q: string) {
  return (
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
    (c.email ?? "").toLowerCase().includes(q) ||
    (c.role ?? "").toLowerCase().includes(q) ||
    (c.companyName ?? "").toLowerCase().includes(q) ||
    // Searchable with or without the dialling code, so both a number copied
    // out of WhatsApp and the bare local digits find the person.
    formatPhone(c.phoneCountry, c.phoneNumber).replace(/\s+/g, "").includes(q)
  );
}

export function ContactsPageClient({
  contacts: initialContacts,
  companies: initialCompanies,
  stages: initialStages,
}: {
  contacts: ContactDTO[];
  companies: CompanyOption[];
  stages: ContactStageDTO[];
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initialContacts);
  const [companies, setCompanies] = useState(initialCompanies);
  const [stages, setStages] = useState(initialStages);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ContactDTO | null>(null);
  const [addToStageId, setAddToStageId] = useState<string | null>(null);
  // Bumped on every open so the editor remounts with a clean form. Closing
  // leaves it alone, which keeps the dialog's exit animation.
  const [editorSession, setEditorSession] = useState(0);

  // A drag writes local state first and the server second, so a refresh that
  // lands between the two would flash the old board back. Server data wins
  // except while a move is still in flight.
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current > 0) return;
    setContacts(initialContacts);
  }, [initialContacts]);
  useEffect(() => {
    if (pending.current > 0) return;
    setStages(initialStages);
  }, [initialStages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return contacts;
    return contacts.filter((c) => matches(c, q));
  }, [contacts, query]);

  /** Runs a mutation with the optimistic state already applied, undoing it on failure. */
  async function commit<T>(
    run: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    rollback: () => void,
  ) {
    pending.current += 1;
    try {
      const result = await run();
      if (!result.ok) {
        rollback();
        setError(result.error);
        return null;
      }
      setError(null);
      return result.data;
    } catch (err) {
      rollback();
      setError((err as Error).message || "Something went wrong");
      return null;
    } finally {
      pending.current -= 1;
      router.refresh();
    }
  }

  function openCreate(stageId: string | null) {
    setEditing(null);
    setAddToStageId(stageId);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  }

  function openEdit(contact: ContactDTO) {
    setEditing(contact);
    setAddToStageId(null);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  }

  function applySaved(saved: ContactDTO) {
    setContacts((prev) => [...prev.filter((c) => c.id !== saved.id), saved]);
    router.refresh();
  }

  async function removeContact(contact: ContactDTO) {
    const name = `${contact.firstName} ${contact.lastName}`;
    if (!confirm(`Delete ${name}? This can't be undone.`)) return;

    const before = contacts;
    setBusyId(contact.id);
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    await commit(
      () => deleteContact(contact.id),
      () => setContacts(before),
    );
    setBusyId(null);
  }

  function moveContact(contactId: string, stageId: string | null) {
    const before = contacts;
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, stageId } : c)),
    );
    void commit(
      () => moveContactToStage(contactId, stageId),
      () => setContacts(before),
    );
  }

  function reorderStages(orderedIds: string[]) {
    const before = stages;
    const byId = new Map(stages.map((s) => [s.id, s]));
    setStages(
      orderedIds
        .map((id) => byId.get(id))
        .filter((s): s is ContactStageDTO => Boolean(s)),
    );
    void commit(
      () => reorderContactStages(orderedIds),
      () => setStages(before),
    );
  }

  async function addStage(name: string) {
    const created = await commit(
      () => createContactStage({ name }),
      () => {},
    );
    if (created) setStages((prev) => [...prev, created]);
  }

  async function renameStage(
    stage: ContactStageDTO,
    next: { name: string; color: string },
  ) {
    const before = stages;
    setStages((prev) =>
      prev.map((s) => (s.id === stage.id ? { ...s, ...next } : s)),
    );
    await commit(
      () => updateContactStage(stage.id, next),
      () => setStages(before),
    );
  }

  async function removeStage(stage: ContactStageDTO) {
    const held = contacts.filter((c) => c.stageId === stage.id).length;
    const warning = held
      ? ` Its ${held} contact${held === 1 ? "" : "s"} will move to Unassigned.`
      : "";
    if (!confirm(`Delete the “${stage.name}” column?${warning}`)) return;

    const beforeStages = stages;
    const beforeContacts = contacts;
    setStages((prev) => prev.filter((s) => s.id !== stage.id));
    setContacts((prev) =>
      prev.map((c) => (c.stageId === stage.id ? { ...c, stageId: null } : c)),
    );
    await commit(
      () => deleteContactStage(stage.id),
      () => {
        setStages(beforeStages);
        setContacts(beforeContacts);
      },
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <PageHeader className="justify-between">
        <PageName>Contacts</PageName>
        <AddButton
          label="Add contact"
          onClick={() => openCreate(stages[0]?.id ?? null)}
        />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-app py-4">
        {error && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="flex-1 text-s text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss"
              className="text-destructive/60 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="relative shrink-0 max-w-[16rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts"
            className="h-9 ps-8 text-s"
          />
        </div>

        <ContactBoard
          stages={stages}
          contacts={filtered}
          busyId={busyId}
          onMoveContact={moveContact}
          onReorderStages={reorderStages}
          onAddStage={addStage}
          onRenameStage={renameStage}
          onDeleteStage={removeStage}
          onOpenContact={openEdit}
          onDeleteContact={removeContact}
          onAddContact={openCreate}
        />
      </div>

      <ContactEditorDialog
        key={editorSession}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        companies={companies}
        defaultStageId={addToStageId}
        onSaved={applySaved}
        onCompanyCreated={(company) =>
          setCompanies((prev) =>
            [...prev, company].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      />
    </div>
  );
}
