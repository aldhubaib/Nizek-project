"use client";

import * as React from "react";
import { format } from "date-fns";
import { Download, ExternalLink, FileText, Paperclip, Trash2, Upload } from "lucide-react";

import { byNumber, byText, Collection, Fact, RecordMenu, RecordRow, RecordRowSkeleton, useList, type SortDef } from "@/next-ui/blocks";
import { useAssets, useDeleteAsset, useUploadAssets, type AssetRow } from "@/next-ui/data/assets";
import { FilterBar } from "@/next-ui/patterns/filter-bar";
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

const searchText = (a: AssetRow) => [a.filename, a.uploadedBy?.name, a.mimeType].filter(Boolean).join(" ");

/**
 * The project's files as rows: a thumbnail for an image, the name, size, who added it and
 * when. "Upload" sends files from this device (the same path the live panel uses: browser →
 * storage, then the record); the ⋯ opens, downloads or removes one. Removing is for admins and
 * project managers, as on the live panel; others do not see it.
 */
export function AssetsView({ projectId, canUpload, canDelete }: { projectId: string; canUpload: boolean; canDelete: boolean }) {
  const assets = useAssets(projectId);
  const upload = useUploadAssets(projectId);
  const remove = useDeleteAsset(projectId);
  const list = useList(assets.data, { searchText, sorts: SORTS, defaultSort: "newest" });
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

  const uploadLabel = progress
    ? progress.count > 1
      ? `Uploading ${progress.index + 1} of ${progress.count}…`
      : `Uploading ${progress.pct}%`
    : "Upload";

  return (
    <div className="flex flex-col">
      <FilterBar
        search={list.query.search}
        onSearch={list.setSearch}
        placeholder="Search files…"
        sorts={SORTS}
        sort={list.query.sort ?? "newest"}
        onSort={list.setSort}
        isFiltered={list.isFiltered}
        onReset={list.reset}
        trailing={
          canUpload && (
            <>
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
              <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
                <Upload />
                {uploadLabel}
              </Button>
            </>
          )
        }
      />
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Collection
        layout="rows"
        items={list.rows}
        total={assets.data?.length}
        isFiltered={list.isFiltered}
        isPending={assets.isPending}
        error={assets.error}
        noun="files"
        getKey={(a) => a.id}
        skeleton={<RecordRowSkeleton />}
        testId="assets-list"
        empty={{
          icon: Paperclip,
          title: "No files yet",
          description: canUpload ? "Upload designs, documents and exports to keep them with the project." : "Files added to the project appear here.",
        }}
        render={(a) => <AssetRowItem asset={a} canDelete={canDelete} onDelete={() => setPendingDelete(a)} />}
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

function AssetRowItem({ asset: a, canDelete, onDelete }: { asset: AssetRow; canDelete: boolean; onDelete: () => void }) {
  const isImage = a.mimeType?.startsWith("image/") ?? false;
  const open = () => window.open(a.url, "_blank", "noopener");
  return (
    <RecordRow
      onOpen={open}
      leading={
        isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.url} alt="" className="size-10 rounded-lg border object-cover" loading="lazy" />
        ) : (
          <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="size-5" />
          </span>
        )
      }
      title={a.filename}
      meta={
        <>
          <Fact>{formatFileSize(a.fileSize)}</Fact>
          <Fact>{format(new Date(a.createdAt), "d MMM yyyy")}</Fact>
          {a.uploadedBy?.name && <Fact label="by">{a.uploadedBy.name}</Fact>}
        </>
      }
      menu={
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
      }
    />
  );
}
