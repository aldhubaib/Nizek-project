"use client";

import { memo, type ReactNode } from "react";
import { X, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";

interface NoteOverlayShellProps {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

export const NoteOverlayShell = memo(function NoteOverlayShell({
  title,
  onClose,
  onBack,
  actions,
  children,
}: NoteOverlayShellProps) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative w-full h-full max-w-4xl max-h-[90vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden m-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <h3 className="text-s font-semibold truncate">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
});
