"use client";

import { useState } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  addSprintReviewVideos,
  removeSprintReviewVideo,
  type SprintReviewVideoDTO,
} from "@/actions/sprint";
import type { ProofVideoInput } from "@/actions/proof-of-work";
import { ProofVideoPlayer } from "@/components/proof/proof-video-list";
import { UploadVideosDialog } from "@/components/proof/upload-videos-dialog";
import { formatFileSize } from "@/lib/file-size";

/**
 * The recording of the sprint review, listed inside the sprint document. A
 * "No video" project cannot end its sprint until one is here, so the row says
 * so plainly while it is empty.
 */
export function SprintReviewVideos({
  sprintId,
  videos,
  canAdd,
  canRemoveAny,
  currentUserId,
  onChange,
}: {
  sprintId: string;
  videos: SprintReviewVideoDTO[];
  /** Staff on an open sprint may add; closed sprints and clients may not. */
  canAdd: boolean;
  /** Whoever may end the sprint can remove anyone's recording. */
  canRemoveAny: boolean;
  currentUserId?: string | null;
  onChange: (videos: SprintReviewVideoDTO[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(uploaded: ProofVideoInput[]) {
    try {
      const next = await addSprintReviewVideos({ sprintId, videos: uploaded });
      onChange(next);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not save the video";
    }
  }

  async function remove(videoId: string) {
    setRemovingId(videoId);
    setError(null);
    try {
      const next = await removeSprintReviewVideo(videoId);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the video");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-2" data-testid="sprint-review-videos">
      {videos.length === 0 ? (
        <p className="text-s text-muted-foreground">
          {canAdd
            ? "No recording yet. Upload the sprint review video to be able to end the sprint."
            : "No recording yet."}
        </p>
      ) : (
        <div className="space-y-1">
          {videos.map((video, i) => {
            const meta = [
              video.fileSize ? formatFileSize(video.fileSize) : null,
              format(new Date(video.createdAt), "MMM d, yyyy"),
              video.uploadedBy?.name ? `by ${video.uploadedBy.name}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const canRemove =
              canAdd && (canRemoveAny || (currentUserId != null && video.uploadedBy?.id === currentUserId));
            return (
              <div
                key={video.id}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-field px-3 py-3"
              >
                <button
                  type="button"
                  onClick={() => setPlaying(i)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-orange/15 text-orange">
                    <Play className="size-4 fill-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-s font-semibold text-foreground">{video.filename}</span>
                    <span className="block text-xs text-muted-foreground">{meta}</span>
                  </span>
                </button>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => void remove(video.id)}
                    disabled={removingId === video.id}
                    aria-label={`Remove ${video.filename}`}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="text-s text-destructive">{error}</p> : null}

      {canAdd ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-s text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          <Plus className="size-4" />
          {videos.length === 0 ? "Upload sprint review video" : "Add another video"}
        </button>
      ) : null}

      {adding ? (
        <UploadVideosDialog
          title="Sprint review video"
          description="Upload the recording of this sprint's review. It stays with the sprint as the record of what was shown."
          submitLabel="Upload"
          onSubmit={add}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {playing != null ? (
        <ProofVideoPlayer
          videos={videos}
          index={playing}
          label="Sprint review"
          onClose={() => setPlaying(null)}
          onIndex={setPlaying}
        />
      ) : null}
    </div>
  );
}
