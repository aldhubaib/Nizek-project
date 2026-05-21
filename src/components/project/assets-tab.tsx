"use client";

import { useState, useRef } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Upload, FileIcon, Trash2, Download, Image, FileText as FileTextIcon } from "lucide-react";
import { createAsset, deleteAsset } from "@/actions/asset";

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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // For v1, we store files as base64 data URLs.
      // In production, use S3/R2/Supabase Storage.
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        await createAsset({
          projectId,
          filename: file.name,
          url: dataUrl,
          fileSize: file.size,
          mimeType: file.type,
        });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setUploading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleDelete(assetId: string) {
    try {
      await deleteAsset(assetId);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Assets</h2>
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {uploading ? "Uploading..." : "Upload"}
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
            const Icon = getFileIcon(asset.mimeType);
            return (
              <div
                key={asset.id}
                className="group rounded-lg border border-border/60 bg-card p-4 hover:border-border transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{asset.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(asset.fileSize)} ·{" "}
                      {format(new Date(asset.createdAt), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {asset.uploadedBy.name ?? "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
