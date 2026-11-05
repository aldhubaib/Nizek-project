"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createAsset, deleteAsset, getAssets } from "@/actions/asset";
import { uploadFileToR2 } from "@/lib/upload";

import { projectKey } from "./projects";

/** A project's files: the list, uploading new ones (browser → storage, then the record), and removing one. */

export type AssetRow = Awaited<ReturnType<typeof getAssets>>[number];

export const projectAssetsKey = (projectId: string) => ["projects", projectId, "assets"] as const;

export function useAssets(projectId: string) {
  return useQuery({
    queryKey: projectAssetsKey(projectId),
    queryFn: () => getAssets(projectId),
    enabled: projectId !== "",
  });
}

/** Uploads the files one after another; `onProgress` gets the index of the file being sent and its percent. */
export function useUploadAssets(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, onProgress }: { files: File[]; onProgress?: (index: number, pct: number) => void }) => {
      for (const [index, file] of files.entries()) {
        const uploaded = await uploadFileToR2(file, (pct) => onProgress?.(index, pct));
        await createAsset({
          projectId,
          filename: uploaded.filename,
          url: uploaded.url,
          fileSize: uploaded.fileSize,
          mimeType: uploaded.mimeType ?? undefined,
        });
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectAssetsKey(projectId) });
      void qc.invalidateQueries({ queryKey: projectKey(projectId) });
    },
  });
}

export function useDeleteAsset(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: (_void, assetId) => {
      qc.setQueryData<AssetRow[]>(projectAssetsKey(projectId), (prev) => prev?.filter((a) => a.id !== assetId));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectAssetsKey(projectId) });
      void qc.invalidateQueries({ queryKey: projectKey(projectId) });
    },
  });
}
