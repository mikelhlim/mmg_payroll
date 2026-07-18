"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPeriod } from "@/lib/actions/payroll";
import { periodSchema, type PeriodInput } from "@/lib/validation/payroll";
import { defaultPeriod } from "@/lib/payroll/period";
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
import { CalendarPlus, Loader2, Plus } from "lucide-react";

export function NewPeriodDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PeriodInput>({
    resolver: zodResolver(periodSchema),
    defaultValues: { ...defaultPeriod(), note: "" },
  });

  function onSubmit(values: PeriodInput) {
    startTransition(async () => {
      const res = await createPeriod(values);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Payroll run created.");
      setOpen(false);
      router.push(`/payroll/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" /> New payroll run
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" /> New payroll run
            </DialogTitle>
            <DialogDescription>
              Defaults to this week (Saturday–Friday). Adjust the dates if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="period_start">Start (Saturday)</Label>
                <Input id="period_start" type="date" {...register("period_start")} />
                {errors.period_start && (
                  <p className="text-xs text-destructive">{errors.period_start.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="period_end">End (Friday)</Label>
                <Input id="period_end" type="date" {...register("period_end")} />
                {errors.period_end && (
                  <p className="text-xs text-destructive">{errors.period_end.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" placeholder="e.g. Week 5" {...register("note")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
