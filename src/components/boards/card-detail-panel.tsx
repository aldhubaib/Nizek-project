"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  Check,
  CircleAlert,
  Loader2,
  MessageSquare,
  MoreVertical,
  Send,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import { cn } from "@/lib/utils";
import { boardColor } from "@/lib/board-palette";
import {
  addBoardCardComment,
  archiveBoardCard,
  deleteBoardCardComment,
  getBoardCard,
  setBoardCardFieldValues,
  updateBoardCard,
  type BoardCardCommentDTO,
  type BoardCardDetailDTO,
} from "@/actions/board-card";
import { BoardIcon } from "./board-icon";
import { CardAttachments } from "./card-attachments";
import { CardDates } from "./card-dates";
import { CardLabels } from "./card-labels";
import { MemberAvatar } from "./member-avatar";
import type { BoardCardTypeDTO, BoardFieldDTO, BoardLabelDTO } from "@/actions/board";
import type { BoardPermissions } from "@/lib/board-permissions";

interface Props {
  cardId: string;
  boardId: string;
  cardTypes: BoardCardTypeDTO[];
  labels: BoardLabelDTO[];
  members: { id: string; name: string | null; imageUrl: string | null }[];
  permissions: BoardPermissions;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}

/**
 * A board field drawn by the sprint board's field renderer.
 *
 * The two carry the same shape — a label, a type, options, and whether an
 * answer is owed — so the component is reused rather than rewritten. `required`
 * maps onto `mandatory` because that is the flag the renderer draws its
 * asterisk from.
 */
function asQuestion(field: BoardFieldDTO): TaskQuestion {
  return {
    id: field.id,
    question: field.label,
    type: field.type,
    options: field.options,
    multiple: field.multiple,
    mandatory: field.required,
    required: field.required,
    order: field.position,
  };
}

export function CardDetailPanel({
  cardId,
  boardId,
  cardTypes,
  labels,
  members,
  permissions,
  currentUserId,
  onClose,
  onChanged,
  onError,
}: Props) {
  const [card, setCard] = useState<BoardCardDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingFields, setSavingFields] = useState(false);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    const data = await getBoardCard(cardId);
    setCard(data);
    setValues(data?.values ?? {});
    setTitle(data?.title ?? "");
    setDescription(data?.description ?? "");
    setLoading(false);
  }, [cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = permissions.canEditCard || permissions.isAdmin;
  const canComment = permissions.canComment || permissions.isAdmin;
  const canManageOthers = permissions.canManageMembers || permissions.isAdmin;
  const cardType = useMemo(
    () => cardTypes.find((type) => type.id === card?.cardTypeId),
    [cardTypes, card?.cardTypeId],
  );
  const palette = boardColor(cardType?.color);

  const missing = useMemo(
    () => new Set(card?.missingRequired ?? []),
    [card?.missingRequired],
  );

  // Field edits save on their own rather than behind a Save button, so a long
  // form cannot be lost by closing the panel. Debounced so typing does not
  // write on every keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueFieldSave = useCallback(
    (next: Record<string, string>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSavingFields(true);
        const result = await setBoardCardFieldValues({ cardId, values: next });
        setSavingFields(false);
        if (!result.success) {
          onError(result.error);
          return;
        }
        setCard((current) =>
          current ? { ...current, missingRequired: result.data.missingRequired } : current,
        );
        onChanged();
      }, 600);
    },
    [cardId, onChanged, onError],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function saveDetails(patch: Parameters<typeof updateBoardCard>[0]) {
    // Shown before the server answers. The title and description keep their own
    // state as you type, but the pickers read straight off `card`, so without
    // this a saved date would not appear until something else reloaded it.
    const { cardId: _id, ...fields } = patch;
    setCard((current) => (current ? { ...current, ...fields } : current));

    const result = await updateBoardCard(patch);
    if (!result.success) {
      onError(result.error);
      await load();
      return;
    }
    onChanged();
  }

  async function archive() {
    const result = await archiveBoardCard(cardId);
    if (!result.success) {
      onError(result.error);
      return;
    }
    onChanged();
    onClose();
  }

  async function postComment() {
    const trimmed = comment.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    const result = await addBoardCardComment({ cardId, content: trimmed });
    setPosting(false);
    if (!result.success) {
      onError(result.error);
      return;
    }
    setComment("");
    await load();
    onChanged();
  }

  async function removeComment(entry: BoardCardCommentDTO) {
    const result = await deleteBoardCardComment(entry.id);
    if (!result.success) {
      onError(result.error);
      return;
    }
    await load();
    onChanged();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88dvh] w-full max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
        {loading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !card ? (
          <div className="grid place-items-center py-24">
            <p className="text-s text-muted-foreground">That card is no longer available.</p>
          </div>
        ) : (
          <>
            {/* The card's identity, on its own bar above both panes so it stays
                put while either side scrolls. */}
            <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-2.5 pe-12">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-0.5",
                  palette.border,
                )}
              >
                <BoardIcon name={cardType?.icon} className={cn("size-3.5", palette.text)} />
                <span className={cn("text-xs font-medium", palette.text)}>
                  {cardType?.name ?? "Card"}
                </span>
              </span>
              <span className="font-mono text-xs text-muted-foreground/70">
                #{card.cardNumber}
              </span>
              {savingFields && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Saving
                </span>
              )}
              <DialogTitle className="sr-only">{card.title}</DialogTitle>

              {(permissions.canDeleteCard || permissions.isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Card actions"
                    className="ms-auto grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <MoreVertical className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void archive()}
                    >
                      <Trash2 className="size-3.5" />
                      Archive card
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </DialogHeader>

            <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_320px]">
              {/* Left: the card itself. */}
              <div className="min-w-0 space-y-5 overflow-y-auto p-4 md:max-h-[calc(88dvh-3rem)]">
                <textarea
                  value={title}
                  disabled={!canEdit}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => {
                    const trimmed = title.trim();
                    if (!trimmed || trimmed === card.title) {
                      setTitle(card.title);
                      return;
                    }
                    void saveDetails({ cardId, title: trimmed });
                  }}
                  rows={1}
                  className="w-full resize-none rounded-md border border-border bg-field px-3 py-2 font-heading text-lg font-medium leading-snug outline-none focus:border-primary/50 disabled:opacity-100"
                />

                {/* Type and assignee read as properties of the card rather than
                    a sidebar, which is the shape a card back wants. */}
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 rounded-md border border-border bg-field px-2 py-1">
                    <span className="text-xs text-muted-foreground">Type</span>
                    <select
                      value={card.cardTypeId}
                      disabled={!canEdit}
                      onChange={(event) =>
                        void saveDetails({ cardId, cardTypeId: event.target.value })
                      }
                      className="bg-transparent text-s outline-none"
                    >
                      {cardTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Just the face, the way the sprint document does it: the
                      name is the tooltip, not a word taking up the row. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={!canEdit}
                      title={card.assignee?.name ?? "Assign"}
                      aria-label={card.assignee?.name ?? "Assign"}
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full outline-none transition-shadow",
                        canEdit && "cursor-pointer hover:ring-2 hover:ring-primary/50",
                      )}
                    >
                      <MemberAvatar person={card.assignee} size="sm" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                      <DropdownMenuItem
                        onClick={() => void saveDetails({ cardId, assigneeId: null })}
                      >
                        <MemberAvatar person={null} />
                        <span className="flex-1">Unassigned</span>
                        {!card.assignee && <Check className="size-3.5" />}
                      </DropdownMenuItem>
                      {members.map((member) => (
                        <DropdownMenuItem
                          key={member.id}
                          onClick={() =>
                            void saveDetails({ cardId, assigneeId: member.id })
                          }
                        >
                          <MemberAvatar person={member} />
                          <span className="flex-1 truncate">
                            {member.name ?? "Unnamed"}
                          </span>
                          {card.assignee?.id === member.id && (
                            <Check className="size-3.5" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <CardLabels
                  boardId={boardId}
                  cardId={cardId}
                  labels={labels}
                  labelIds={card.labelIds}
                  canEdit={canEdit}
                  canManage={permissions.canManageTypes || permissions.isAdmin}
                  onChanged={() => {
                    void load();
                    onChanged();
                  }}
                  onError={onError}
                />

                <CardDates
                  startDate={card.startDate}
                  dueDate={card.dueDate}
                  dueDone={card.dueDone}
                  canEdit={canEdit}
                  onSave={(patch) => void saveDetails({ cardId, ...patch })}
                />

                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlignLeft className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                    <h3 className="text-s font-medium text-foreground">Description</h3>
                  </div>
                  <textarea
                    value={description}
                    disabled={!canEdit}
                    onChange={(event) => setDescription(event.target.value)}
                    onBlur={() => {
                      if (description === (card.description ?? "")) return;
                      void saveDetails({ cardId, description: description || null });
                    }}
                    placeholder={canEdit ? "Add a more detailed description…" : "No description"}
                    className="min-h-[96px] w-full resize-none rounded-md border border-border bg-field px-3 py-2 text-s leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                  />
                </section>

                <CardAttachments
                  cardId={cardId}
                  attachments={card.attachments}
                  canEdit={canEdit}
                  currentUserId={currentUserId}
                  canManageOthers={canManageOthers}
                  onChanged={() => {
                    void load();
                    onChanged();
                  }}
                  onError={onError}
                />

                {card.fields.length > 0 && (
                  <section className="space-y-4 rounded-lg border border-border/50 p-3">
                    {card.fields.map((field, index) => (
                      <div key={field.id}>
                        <QuestionField
                          question={asQuestion(field)}
                          index={index}
                          value={values[field.id] ?? ""}
                          readonly={!canEdit}
                          onChange={(value) => {
                            const next = { ...values, [field.id]: value };
                            setValues(next);
                            queueFieldSave(next);
                          }}
                        />
                        {missing.has(field.id) && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-orange">
                            <CircleAlert className="size-3" />
                            Required
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                )}
              </div>

              {/* Right: the conversation, and the card's own history at the
                  bottom of it — newest first, the way a feed reads. */}
              <div className="flex min-w-0 flex-col border-border bg-muted/20 md:max-h-[calc(88dvh-3rem)] md:border-s">
                <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 md:border-t-0">
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  <h3 className="text-s font-medium text-foreground">Comments and activity</h3>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
                  {canComment && (
                    <div className="flex gap-2">
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            void postComment();
                          }
                        }}
                        placeholder="Write a comment…"
                        rows={2}
                        className="min-h-[44px] flex-1 resize-none rounded-md border border-border bg-field px-3 py-2 text-s outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                      />
                      <button
                        type="button"
                        onClick={() => void postComment()}
                        disabled={!comment.trim() || posting}
                        aria-label="Post comment"
                        className="grid size-9 shrink-0 place-items-center self-end rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {posting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </button>
                    </div>
                  )}

                  {[...card.comments].reverse().map((entry) => (
                    <div key={entry.id} className="group flex gap-2">
                      <MemberAvatar person={entry.user} size="sm" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {entry.user.name ?? "Someone"}
                        </p>
                        <p className="whitespace-pre-wrap text-s text-foreground/90">
                          {entry.content}
                        </p>
                        <p className="text-xs text-muted-foreground/60">
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {(entry.user.id === currentUserId || canManageOthers) && (
                        <button
                          type="button"
                          aria-label="Delete comment"
                          onClick={() => void removeComment(entry)}
                          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <MemberAvatar person={card.createdBy} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-s text-foreground/80">
                        <span className="font-medium">
                          {card.createdBy.name ?? "Someone"}
                        </span>{" "}
                        added this card
                      </p>
                      <p className="text-xs text-muted-foreground/60">
                        {formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
