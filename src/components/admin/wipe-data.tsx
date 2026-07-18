"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { wipeAllData } from "@/lib/actions/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

const CONFIRM = "DELETE ALL DATA";

export function WipeData() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  function onWipe() {
    startTransition(async () => {
      const res = await wipeAllData();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("All data deleted. Admin accounts kept.");
      setOpen(false);
      setConfirm("");
      router.refresh();
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" /> Danger zone
        </CardTitle>
        <CardDescription>
          Permanently delete all employees, payroll runs, advances, loans, and every non-admin user.
          Admin accounts are kept. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setConfirm("");
          }}
        >
          <DialogTrigger render={<Button variant="destructive" />}>
            Delete all data
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete all data?</DialogTitle>
              <DialogDescription>
                This wipes every employee, payslip, advance, loan, and non-admin user. Type{" "}
                <span className="font-semibold text-foreground">{CONFIRM}</span> to confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <Label htmlFor="confirm">Confirmation</Label>
              <Input
                id="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={confirm !== CONFIRM || pending}
                onClick={onWipe}
              >
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Permanently delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
