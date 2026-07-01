"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, History } from "lucide-react";
import { ActivityTimeline } from "./activity-timeline";

interface Props {
  taskId: string;
  refreshKey?: number;
  onClose: () => void;
}

export function TaskHistoryDialog({ taskId, refreshKey, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-md w-full mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
          <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-[13px] font-semibold flex-1">Task History</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <ActivityTimeline taskId={taskId} refreshKey={refreshKey} />
        </div>
      </div>
    </div>,
    document.body
  );
}
