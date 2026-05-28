"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface RemoveMatterButtonProps {
  matterId: Id<"matters">;
  matterTitle: string;
  redirectTo?: string;
  variant?: "outline" | "destructive" | "ghost";
  size?: "sm" | "default";
}

export function RemoveMatterButton({
  matterId,
  matterTitle,
  redirectTo = "/lawyer/matters",
  variant = "outline",
  size = "sm",
}: RemoveMatterButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const removeMatter = useMutation(api.matters.remove);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    if (!user) return;

    setIsRemoving(true);
    try {
      await removeMatter({ matterId, lawyerId: user._id });
      toast.success("Matter removed");
      setDialogOpen(false);
      router.push(redirectTo);
    } catch {
      toast.error("Failed to remove matter");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={variant === "ghost" ? "text-muted-foreground hover:text-destructive" : undefined}
        onClick={() => setDialogOpen(true)}
      >
        <Trash2 className="w-4 h-4 mr-1" />
        Remove
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove matter?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{matterTitle}</strong>, including all
              assigned clients, simulation sessions, and feedback. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isRemoving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving ? "Removing..." : "Remove Matter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
