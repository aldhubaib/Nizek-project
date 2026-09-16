"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function MovePermissionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-black text-white ring-white/10 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-white">
            You don&apos;t have permission to move this card
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Please ask your admin if you think there is a mistake.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-0 bg-black">
          <Button
            type="button"
            variant="outline"
            className="border-white/20 bg-black text-white hover:bg-white/10 hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
