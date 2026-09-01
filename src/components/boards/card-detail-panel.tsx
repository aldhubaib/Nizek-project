"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Loader2, Send, Trash2, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  type BoardCardDetailDTO,
} from "@/actions/board-card";
import { BoardIcon } from "./board-icon";
import type { BoardCardTypeDTO, BoardFieldDTO } from "@/actions/board";
import type { BoardPermissions } from "@/lib/board-permissions";

interface Props {
  cardId: string;
  cardTypes: BoardCardTypeDTO[];
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
  cardTypes,
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
    const result = await updateBoardCard(patch);
    if (!result.success) {
      onError(result.error);
      await load();
      return;
    }
    onChanged();
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !card ? (
          <div className="grid place-items-center py-16">
            <p className="text-s text-muted-foreground">That card is no longer available.</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <BoardIcon name={cardType?.icon} className={cn("size-4", palette.text)} />
                <span className="font-mono text-xs text-muted-foreground/70">
                  #{card.cardNumber}
                </span>
                {savingFields && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Saving
                  </span>
                )}
              </div>
              <DialogTitle className="sr-only">{card.title}</DialogTitle>
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
                className="w-full resize-none bg-transparent font-heading text-base font-medium leading-snug outline-none disabled:opacity-100"
              />
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div className="min-w-0 space-y-4">
                <div className="space-y-2">
                  <label className="text-s font-medium text-muted-foreground">
                    Description
                  </label>
                  <textarea
                    value={description}
                    disabled={!canEdit}
                    onChange={(event) => setDescription(event.target.value)}
                    onBlur={() => {
                      if (description === (card.description ?? "")) return;
                      void saveDetails({ cardId, description: description || null });
                    }}
                    placeholder={canEdit ? "Add more detail…" : "No description"}
                    className="min-h-[80px] w-full resize-none rounded-md border border-border bg-field px-3 py-2 text-s leading-relaxed outline-none placeholder:text-muted-foreground/60"
                  />
                </div>

                {card.fields.length > 0 && (
                  <div className="space-y-4 rounded-lg border border-border/50 p-3">
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
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-s font-medium text-muted-foreground">
                    Comments {card.comments.length > 0 && `(${card.comments.length})`}
                  </h4>

                  {card.comments.map((entry) => (
                    <div key={entry.id} className="flex gap-2">
                      {entry.user.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.user.imageUrl}
                          alt=""
                          className="mt-0.5 size-6 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] text-muted-foreground">
                          <UserRound className="size-3" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {entry.user.name ?? "Someone"}
                        </p>
                        <p className="whitespace-pre-wrap text-s text-foreground/90">
                          {entry.content}
                        </p>
                      </div>
                      {(entry.user.id === currentUserId || permissions.canManageMembers || permissions.isAdmin) && (
                        <button
                          type="button"
                          aria-label="Delete comment"
                          onClick={async () => {
                            const result = await deleteBoardCardComment(entry.id);
                            if (!result.success) {
                              onError(result.error);
                              return;
                            }
                            await load();
                            onChanged();
                          }}
                          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {permissions.canComment || permissions.isAdmin ? (
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
                        className="min-h-[44px] flex-1 resize-none rounded-md border border-border bg-field px-3 py-2 text-s outline-none placeholder:text-muted-foreground/60"
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
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <select
                    value={card.cardTypeId}
                    disabled={!canEdit}
                    onChange={(event) => void saveDetails({ cardId, cardTypeId: event.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-field px-2 text-s outline-none"
                  >
                    {cardTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Assignee</label>
                  <select
                    value={card.assignee?.id ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      void saveDetails({ cardId, assigneeId: event.target.value || null })
                    }
                    className="h-9 w-full rounded-md border border-border bg-field px-2 text-s outline-none"
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name ?? "Unnamed"}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-muted-foreground/70">
                  Added by {card.createdBy.name ?? "someone"} on{" "}
                  {new Date(card.createdAt).toLocaleDateString()}
                </p>

                {(permissions.canDeleteCard || permissions.isAdmin) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await archiveBoardCard(cardId);
                      if (!result.success) {
                        onError(result.error);
                        return;
                      }
                      onChanged();
                      onClose();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/30 px-3 py-2 text-s font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                    Archive card
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
