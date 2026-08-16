"use client";

import { useState, useRef } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Upload, FileIcon, Trash2, Download, Image, FileText as FileTextIcon } from "lucide-react";
import { createAsset, deleteAsset } from "@/actions/asset";
import { uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";

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
  assets: Asset[];
  projectId: string;
  canEdit: boolean;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null) {
  if (mimeType?.startsWith("image/")) return Image;
  return FileTextIcon;
}

export function AssetsTab({ assets, projectId, canEdit }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const { url } = await uploadFileToR2(file);
        await createAsset({
          projectId,
          filename: file.name,
          url,
          fileSize: file.size,
          mimeType: file.type,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const pasteRef = usePasteFiles(
    (files) => {
      void uploadFiles(files);
    },
    { enabled: canEdit && !uploading, capture: true },
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    await uploadFiles(Array.from(files));
  }

  async function handleDelete(assetId: string) {
    try {
      await deleteAsset(assetId);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div ref={pasteRef}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Assets</h2>
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {uploading ? "Uploading..." : "Upload or paste"}
            </Button>
          </>
        )}
      </div>

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileIcon className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">No assets uploaded yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const isImage = asset.mimeType?.startsWith("image/");
            const Icon = getFileIcon(asset.mimeType);
            return (
              <div
                key={asset.id}
                className="group rounded-lg border border-border/60 bg-card overflow-hidden hover:border-border transition-colors"
              >
                {isImage ? (
                  <div className="relative w-full aspect-video bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={asset.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-28 items-center justify-center bg-muted/50">
                    <Icon className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{asset.filename}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatFileSize(asset.fileSize)} · {format(new Date(asset.createdAt), "MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    by {asset.uploadedBy.name ?? "Unknown"}
                  </p>
                  <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={asset.url}
                      download={asset.filename}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </a>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(asset.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
