"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/kanban/board";
import { MeetingNotesTab } from "@/components/project/meeting-notes-tab";
import { AssetsTab } from "@/components/project/assets-tab";
import { ContractBadge } from "@/components/project/contract-badge";
import { AddContractDialog } from "@/components/project/add-contract-dialog";
import { EditContractDialog } from "@/components/project/edit-contract-dialog";
import { MemberList } from "@/components/team/member-list";
import { InviteMemberDialog } from "@/components/team/invite-member-dialog";

import type { TaskQuestion } from "@/components/kanban/question-field";
import { LayoutGrid, FileText, Paperclip, ScrollText, Users, Trash2, AlertTriangle } from "lucide-react";
import { deleteContract, toggleLatePayment } from "@/actions/project";
import type { KanbanTask } from "@/store/kanban";
export interface UserPermissions {
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  allowedStages: string[];
  allowedTransitions: Record<string, string[]>;
  createStages: string[];
  modifyStages: string[];
  isAdmin: boolean;
  systemRole: string;
}

interface Contract {
  id: string;
  label: string | null;
  contractType: string;
  startDate: Date;
  endDate: Date;
  latePayment: boolean;
}

interface ProjectRole {
  id: string;
  name: string;
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  allowedStages: string | null;
  allowedTransitions: string | null;
  _count: { members: number };
}

interface Member {
  id: string;
  role: string;
  roleId: string | null;
  projectRole: {
    id: string;
    name: string;
    isAdmin: boolean;
    canCreateTask: boolean;
    canModifyTask: boolean;
    canMoveTask: boolean;
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    imageUrl: string | null;
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  contracts: Contract[];
  _count: { tasks: number; meetingNotes: number; assets: number };
}

interface NoteHistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
}

interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: Date;
  noteType: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; imageUrl: string | null };
  task: { id: string; title: string; taskNumber: number; taskType: string } | null;
  history: NoteHistoryEntry[];
}

interface Asset {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: Date;
  uploadedBy: { id: string; name: string | null };
}

interface Props {
  project: Project;
  tasks: KanbanTask[];
  notes: MeetingNote[];
  assets: Asset[];
  userRole: string;
  userPermissions: UserPermissions;
  isActive: boolean;
  questions: TaskQuestion[];
  roles: ProjectRole[];
  members: Member[];
  currentUserId: string;
  invitations: Invitation[];
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  invitedBy: { id: string; name: string | null; imageUrl: string | null };
  projectRole: { id: string; name: string; isAdmin: boolean } | null;
}

export function ProjectDetailClient({
  project,
  tasks,
  notes,
  assets,
  userRole,
  userPermissions,
  isActive,
  questions,
  roles,
  members,
  currentUserId,
  invitations,
  allowedTaskTypes,
  activeContractType,
}: Props) {
  const canEdit = userPermissions.canModifyTask || userPermissions.isAdmin;
  const isAdmin = userPermissions.isAdmin;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTabState] = useState(searchParams.get("tab") ?? "board");

  function setActiveTab(tab: string) {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {project.logoUrl ? (
            <img
              src={project.logoUrl}
              alt={project.name}
              className="w-7 h-7 rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-primary">
                {project.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="text-sm font-semibold truncate">{project.name}</h1>
          {!isActive && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold bg-destructive/15 text-destructive border-destructive/20">
              Expired
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as string)} className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="board" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Notes
              <span className="ml-1 text-[10px] text-muted-foreground">
                {notes.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />
              Assets
              <span className="ml-1 text-[10px] text-muted-foreground">
                {assets.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-1.5">
              <ScrollText className="h-3.5 w-3.5" />
              Contracts
              <span className="ml-1 text-[10px] text-muted-foreground">
                {project.contracts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Team
              <span className="ml-1 text-[10px] text-muted-foreground">
                {members.length + invitations.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board">
            <KanbanBoard
              initialTasks={tasks as unknown as KanbanTask[]}
              projectId={project.id}
              userRole={userRole}
              userPermissions={userPermissions}
              isProjectActive={isActive}
              questions={questions as unknown as (TaskQuestion & { taskType: string })[]}
              currentUserId={currentUserId}
              allowedTaskTypes={allowedTaskTypes}
              activeContractType={activeContractType}
            />
          </TabsContent>

          <TabsContent value="notes">
            <MeetingNotesTab
              notes={notes as unknown as MeetingNote[]}
              projectId={project.id}
              canEdit={canEdit}
            />
          </TabsContent>

          <TabsContent value="assets">
            <AssetsTab
              assets={assets as unknown as Asset[]}
              projectId={project.id}
              canEdit={canEdit}
            />
          </TabsContent>

          <TabsContent value="contracts">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">Contracts</h2>
                {isAdmin && <AddContractDialog projectId={project.id} />}
              </div>
              {project.contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center gap-3 py-12">
                  <ScrollText className="w-10 h-10 text-muted-foreground opacity-50" strokeWidth={1.5} />
                  <p className="text-[13px] text-muted-foreground">
                    No contracts added yet.
                  </p>
                </div>
              ) : (
                <ContractList
                  contracts={project.contracts}
                  isAdmin={isAdmin}
                  projectId={project.id}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="team">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">Team Members</h2>
                {isAdmin && (
                  <InviteMemberDialog projectId={project.id} roles={roles} />
                )}
              </div>
              <MemberList
                members={members}
                projectId={project.id}
                currentUserRole={userRole}
                currentUserId={currentUserId}
                roles={roles}
                invitations={invitations}
              />
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}

function ContractList({ contracts, isAdmin, projectId }: { contracts: Contract[]; isAdmin: boolean; projectId: string }) {
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete(contractId: string) {
    if (!confirm("Delete this contract? This cannot be undone.")) return;
    setDeletingId(contractId);
    try {
      await deleteContract(contractId);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleLatePayment(contractId: string) {
    setTogglingId(contractId);
    try {
      await toggleLatePayment(contractId);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <div className="space-y-2">
        {contracts.map((contract) => (
          <div
            key={contract.id}
            className={`rounded-lg border bg-card p-4 flex items-center justify-between gap-3 ${
              contract.latePayment ? "border-amber-500/30 bg-amber-500/5" : "border-border"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ContractBadge contract={contract} />
              {contract.latePayment && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">
                  <AlertTriangle className="w-3 h-3" />
                  Late Payment
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleLatePayment(contract.id)}
                  disabled={togglingId === contract.id}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    contract.latePayment
                      ? "text-amber-400 hover:bg-amber-500/10"
                      : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
                  }`}
                  title={contract.latePayment ? "Remove late payment flag" : "Mark as late payment"}
                >
                  {togglingId === contract.id
                    ? "..."
                    : contract.latePayment
                      ? "Unmark Late"
                      : "Late Payment"}
                </button>
                <button
                  onClick={() => setEditingContract(contract)}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Edit contract"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(contract.id)}
                  disabled={deletingId === contract.id}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  title="Delete contract"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingContract && (
        <EditContractDialog
          contract={editingContract}
          open={!!editingContract}
          onClose={() => setEditingContract(null)}
        />
      )}
    </>
  );
}
