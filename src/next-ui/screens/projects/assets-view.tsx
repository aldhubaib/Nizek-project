"use client";

import * as React from "react";
import { format } from "date-fns";
import { Download, ExternalLink, File, FileArchive, FileText, Image as ImageIcon, LoaderCircle, Music, Paperclip, Trash2, Upload, Video, type LucideIcon } from "lucide-react";

import {
  byNumber,
  byText,
  Collection,
  Fact,
  RecordCard,
  RecordCardSkeleton,
  RecordMenu,
  RecordRow,
  RecordRowSkeleton,
  useList,
  type SortDef,
} from "@/next-ui/blocks";
import { useAssets, useDeleteAsset, useUploadAssets, type AssetRow } from "@/next-ui/data/assets";
import { filterGroup, optionsOf, usePageFilters } from "@/next-ui/patterns/filter-menu";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { usePageView } from "@/next-ui/patterns/view-menu";
import { Button } from "@/next-ui/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/next-ui/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/next-ui/ui/dropdown-menu";

import { formatFileSize } from "./board-state";

const SORTS: SortDef<AssetRow>[] = [
  { id: "newest", label: "Newest", compare: byNumber((a) => new Date(a.createdAt).getTime()) },
  { id: "name", label: "Name", compare: byText((a) => a.filename) },
  { id: "size", label: "Largest", compare: byNumber((a) => a.fileSize ?? 0) },
];

/** The kinds a file is sorted into for the Filter menu, from its media type, in menu order. */
export const FILE_KINDS: Record<string, { label: string; icon: LucideIcon }> = {
  image: { label: "Images", icon: ImageIcon },
  video: { label: "Videos", icon: Video },
  audio: { label: "Audio", icon: Music },
  document: { label: "Documents", icon: FileText },
  archive: { label: "Archives", icon: FileArchive },
  other: { label: "Other", icon: File },
};
const KIND_ORDER = Object.keys(FILE_KINDS);

export function fileKind(mimeType: string | null | undefined): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/zip|compressed|tar|rar|7z/.test(mime)) return "archive";
  if (mime.startsWith("text/") || /pdf|document|word|sheet|excel|presentation|powerpoint|rtf|json|xml|csv/.test(mime)) return "document";
  return "other";
}

const searchText = (a: AssetRow) => [a.filename, a.uploadedBy?.name, a.mimeType].filter(Boolean).join(" ");

/**
 * The project's files, as rows or as cards (the View menu): a thumbnail for an image, the
 * name, size, who added it and when. The Filter menu narrows by kind (images, documents…) and
 * by who added them. "Upload" sends files from this device (the same path the live panel uses:
 * browser → storage, then the record); the ⋯ opens, downloads or removes one. Removing is for
 * admins and project managers, as on the live panel; others do not see it.
 */
export function AssetsView({ projectId, canUpload, canDelete }: { projectId: string; canUpload: boolean; canDelete: boolean }) {
  const assets = useAssets(projectId);
  const upload = useUploadAssets(projectId);
  const remove = useDeleteAsset(projectId);
  const filters = usePageFilters(`assets:${projectId}`);
  const view = usePageView("assets");
  const rows = assets.data;
  const groups = React.useMemo(
    () => [
      filterGroup(
        filters,
        "kind",
        optionsOf(
          rows,
          (a) => fileKind(a.mimeType),
          (v) => {
            const Icon = FILE_KINDS[v]?.icon ?? File;
            return { label: FILE_KINDS[v]?.label ?? v, icon: <Icon /> };
          },
          KIND_ORDER,
        ),
      ),
      filterGroup(filters, "by", optionsOf(rows, (a) => a.uploadedBy?.name), "Added by"),
    ],
    [rows, filters],
  );
  const scoped = React.useMemo(
    () => rows?.filter((a) => filters.passes("kind", fileKind(a.mimeType)) && filters.passes("by", a.uploadedBy?.name)),
    [rows, filters],
  );
  const list = useList(scoped, { searchText, sorts: SORTS, defaultSort: "newest" });
  const isFiltered = list.isFiltered || filters.active;
  const clear = () => {
    list.reset();
    filters.clear();
  };
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<{ index: number; count: number; pct: number } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AssetRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const send = (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setProgress({ index: 0, count: files.length, pct: 0 });
    upload.mutate(
      { files, onProgress: (index, pct) => setProgress({ index, count: files.length, pct }) },
      {
        onError: (err) => setError(err instanceof Error ? err.message : "Upload failed."),
        onSettled: () => setProgress(null),
      },
    );
  };

  // "Uploading 2 of 5…" while several files go up, else the one file's percentage
  const uploadLabel = progress ? (progress.count > 1 ? `Uploading ${progress.index + 1} of ${progress.count}…` : `Uploading ${progress.pct}%`) : "Upload";

  return (
    <div className="flex flex-col">
      <ListTools
        what="files"
        search={list.query.search}
        onSearch={list.setSearch}
        groups={groups}
        view={view}
        sorts={SORTS}
        sort={list.query.sort ?? "newest"}
        onSort={list.setSort}
        action={
          canUpload && (
            <HeaderAction
              label={uploadLabel}
              icon={progress ? <LoaderCircle className="animate-spin" /> : <Upload />}
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              data-testid="upload-button"
            />
          )
        }
      />
      {progress && (
        <div role="status" className="mb-4 flex items-center gap-3 text-sm text-muted-foreground" data-testid="upload-progress">
          <span className="shrink-0">{uploadLabel}</span>
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.pct}%` }} />
          </span>
        </div>
      )}
      {canUpload && (
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose files to upload"
          onChange={(e) => {
            send(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Collection
        layout={view.cards ? "grid" : "rows"}
        min={view.min}
        items={list.rows}
        total={rows?.length}
        isFiltered={isFiltered}
        onClearFilters={clear}
        isPending={assets.isPending}
        error={assets.error}
        noun="files"
        getKey={(a) => a.id}
        skeleton={view.cards ? <RecordCardSkeleton /> : <RecordRowSkeleton />}
        testId="assets-list"
        empty={{
          icon: Paperclip,
          title: "No files yet",
          description: canUpload ? "Upload designs, documents and exports to keep them with the project." : "Files added to the project appear here.",
        }}
        render={(a) => <AssetItem asset={a} cards={view.cards} canDelete={canDelete} onDelete={() => setPendingDelete(a)} />}
      />

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this file?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.filename}” is deleted from the project and from storage. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!pendingDelete) return;
                remove.mutate(pendingDelete.id, {
                  onError: (err) => setError(err instanceof Error ? err.message : "Could not remove the file."),
                  onSettled: () => setPendingDelete(null),
                });
              }}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssetItem({ asset: a, cards, canDelete, onDelete }: { asset: AssetRow; cards: boolean; canDelete: boolean; onDelete: () => void }) {
  const isImage = fileKind(a.mimeType) === "image";
  const Icon = FILE_KINDS[fileKind(a.mimeType)]?.icon ?? File;
  const open = () => window.open(a.url, "_blank", "noopener");
  const meta = (
    <>
      <Fact>{formatFileSize(a.fileSize)}</Fact>
      <Fact>{format(new Date(a.createdAt), "d MMM yyyy")}</Fact>
      {a.uploadedBy?.name && <Fact label="by">{a.uploadedBy.name}</Fact>}
    </>
  );
  const menu = (
    <RecordMenu contentClassName="min-w-44">
      <DropdownMenuItem onSelect={open}>
        <ExternalLink />
        Open
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={a.url} download={a.filename}>
          <Download />
          Download
        </a>
      </DropdownMenuItem>
      {canDelete && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </>
      )}
    </RecordMenu>
  );
  if (cards) {
    return (
      <RecordCard
        onOpen={open}
        cover={isImage ? a.url : null}
        media={<Icon className="size-10 text-muted-foreground" />}
        title={a.filename}
        meta={meta}
        menu={menu}
      />
    );
  }
  return (
    <RecordRow
      onOpen={open}
      leading={
        isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.url} alt="" className="size-10 rounded-lg border object-cover" loading="lazy" />
        ) : (
          <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </span>
        )
      }
      title={a.filename}
      meta={meta}
      menu={menu}
    />
  );
}
