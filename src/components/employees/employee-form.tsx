"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, Controller, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { employeeSchema, employeeDefaults, type EmployeeInput } from "@/lib/validation/employee";
import { createEmployee, updateEmployee } from "@/lib/actions/employees";
import type { Advance, Employee, Loan } from "@/lib/types";
import { LoansCard } from "@/components/employees/loans-card";
import { AdvancesCard } from "@/components/employees/advances-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

function toFormValues(e?: Employee): EmployeeInput {
  if (!e) return employeeDefaults;
  return {
    first_name: e.first_name,
    last_name: e.last_name,
    middle_name: e.middle_name ?? "",
    nickname: e.nickname ?? "",
    birthdate: e.birthdate ?? "",
    employment_date: e.employment_date ?? "",
    sss_number: e.sss_number ?? "",
    philhealth_number: e.philhealth_number ?? "",
    pagibig_number: e.pagibig_number ?? "",
    daily_wage: e.daily_wage,
    overtime_fee: e.overtime_fee,
    food_allowance_per_day: e.food_allowance_per_day,
    sleep_allowance_per_day: e.sleep_allowance_per_day,
    sss_contribution: e.sss_contribution,
    pagibig_contribution: e.pagibig_contribution,
    philhealth_contribution: e.philhealth_contribution,
    is_active: e.is_active,
  };
}

function Field({
  label,
  htmlFor,
  error,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MoneyInput({
  id,
  suffix,
  registration,
}: {
  id: string;
  suffix?: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₱
      </span>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        className="pl-7"
        {...registration}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

// Internal same-origin links only — external/mailto/tel/new-tab/download links
// are left to the browser as normal.
function isGuardableAnchor(a: HTMLAnchorElement): boolean {
  const href = a.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  return true;
}

export function EmployeeForm({
  employee,
  loans = [],
  advances = [],
}: {
  employee?: Employee;
  loans?: Loan[];
  advances?: Advance[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(employee);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    defaultValues: toFormValues(employee),
  });

  // Unsaved-changes guard: intercept clicks on other in-app links (nav bar,
  // mobile tab bar, breadcrumbs, etc.) while the form is dirty, and offer to
  // save or discard before leaving. A ref keeps the listener reading the
  // latest dirty state without re-registering on every keystroke.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (!isDirtyRef.current) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || !isGuardableAnchor(anchor)) return;
      const href = anchor.getAttribute("href")!;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      pendingHrefRef.current = href;
      setLeaveDialogOpen(true);
    }
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  async function performSave(values: EmployeeInput): Promise<{ id: string } | null> {
    const res = isEdit ? await updateEmployee(employee!.id, values) : await createEmployee(values);
    if ("error" in res) {
      toast.error(res.error);
      return null;
    }
    toast.success(isEdit ? "Employee updated." : "Employee added.");
    return { id: res.id };
  }

  function onSubmit(values: EmployeeInput) {
    startTransition(async () => {
      const result = await performSave(values);
      if (!result) return;
      router.push(isEdit ? `/employees/${result.id}` : "/employees");
      router.refresh();
    });
  }

  function handleKeepEditing() {
    setLeaveDialogOpen(false);
    pendingHrefRef.current = null;
  }

  function handleDiscardAndLeave() {
    const href = pendingHrefRef.current;
    setLeaveDialogOpen(false);
    if (href) router.push(href);
  }

  function handleSaveAndLeave() {
    handleSubmit(
      async (values) => {
        setLeaveSaving(true);
        const result = await performSave(values);
        setLeaveSaving(false);
        setLeaveDialogOpen(false);
        if (!result) return;
        const href = pendingHrefRef.current;
        if (href) router.push(href);
        router.refresh();
      },
      () => setLeaveDialogOpen(false)
    )();
  }

  const money = (name: keyof EmployeeInput) => register(name, { valueAsNumber: true });

  return (
    // A plain <div>, not a <form>: the Loans/Advances cards below each render
    // their own independent <form>, and HTML doesn't allow nested forms. Save
    // is triggered by the button's onClick calling handleSubmit imperatively.
    <div className="space-y-6">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="compensation">Compensation</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
              <Field label="First name" htmlFor="first_name" error={errors.first_name?.message}>
                <Input id="first_name" {...register("first_name")} />
              </Field>
              <Field label="Last name" htmlFor="last_name" error={errors.last_name?.message}>
                <Input id="last_name" {...register("last_name")} />
              </Field>
              <Field label="Middle name" htmlFor="middle_name" error={errors.middle_name?.message}>
                <Input id="middle_name" {...register("middle_name")} />
              </Field>
              <Field label="Nickname" htmlFor="nickname" error={errors.nickname?.message}>
                <Input id="nickname" {...register("nickname")} />
              </Field>
              <Field label="Birthdate" htmlFor="birthdate" error={errors.birthdate?.message}>
                <Input id="birthdate" type="date" {...register("birthdate")} />
              </Field>
              <Field
                label="Employment date"
                htmlFor="employment_date"
                error={errors.employment_date?.message}
              >
                <Input id="employment_date" type="date" {...register("employment_date")} />
              </Field>

              <div className="sm:col-span-2">
                <p className="mb-3 mt-1 text-sm font-semibold text-muted-foreground">
                  Government IDs
                </p>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="SSS number" htmlFor="sss_number" error={errors.sss_number?.message}>
                    <Input id="sss_number" {...register("sss_number")} />
                  </Field>
                  <Field
                    label="PhilHealth number"
                    htmlFor="philhealth_number"
                    error={errors.philhealth_number?.message}
                  >
                    <Input id="philhealth_number" {...register("philhealth_number")} />
                  </Field>
                  <Field
                    label="Pag-IBIG number"
                    htmlFor="pagibig_number"
                    error={errors.pagibig_number?.message}
                  >
                    <Input id="pagibig_number" {...register("pagibig_number")} />
                  </Field>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compensation */}
        <TabsContent value="compensation" className="mt-4 space-y-6">
          <Card>
            <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
              <Field
                label="Daily wage"
                htmlFor="daily_wage"
                error={errors.daily_wage?.message}
                hint="Base pay per day worked"
              >
                <MoneyInput id="daily_wage" suffix="/day" registration={money("daily_wage")} />
              </Field>
              <Field
                label="Overtime fee"
                htmlFor="overtime_fee"
                error={errors.overtime_fee?.message}
                hint="Fixed fee per overtime day"
              >
                <MoneyInput id="overtime_fee" suffix="/OT day" registration={money("overtime_fee")} />
              </Field>
              <Field
                label="Food allowance"
                htmlFor="food_allowance_per_day"
                error={errors.food_allowance_per_day?.message}
              >
                <MoneyInput
                  id="food_allowance_per_day"
                  suffix="/day"
                  registration={money("food_allowance_per_day")}
                />
              </Field>
              <Field
                label="Sleep allowance"
                htmlFor="sleep_allowance_per_day"
                error={errors.sleep_allowance_per_day?.message}
              >
                <MoneyInput
                  id="sleep_allowance_per_day"
                  suffix="/day"
                  registration={money("sleep_allowance_per_day")}
                />
              </Field>

              <div className="sm:col-span-2">
                <p className="mb-3 mt-1 text-sm font-semibold text-muted-foreground">
                  Weekly government contributions (defaults, editable each payroll)
                </p>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="SSS" htmlFor="sss_contribution" error={errors.sss_contribution?.message}>
                    <MoneyInput id="sss_contribution" registration={money("sss_contribution")} />
                  </Field>
                  <Field
                    label="Pag-IBIG"
                    htmlFor="pagibig_contribution"
                    error={errors.pagibig_contribution?.message}
                  >
                    <MoneyInput
                      id="pagibig_contribution"
                      registration={money("pagibig_contribution")}
                    />
                  </Field>
                  <Field
                    label="PhilHealth"
                    htmlFor="philhealth_contribution"
                    error={errors.philhealth_contribution?.message}
                  >
                    <MoneyInput
                      id="philhealth_contribution"
                      registration={money("philhealth_contribution")}
                    />
                  </Field>
                </div>
              </div>

              <div className="sm:col-span-2">
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => (
                    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                      <span>Active employee (included in payroll runs)</span>
                    </label>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {isEdit && (
            <div className="grid gap-6 lg:grid-cols-2">
              <LoansCard employeeId={employee!.id} loans={loans} />
              <AdvancesCard employeeId={employee!.id} advances={advances} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit(onSubmit)} disabled={pending}>
          {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {isEdit ? "Save changes" : "Add employee"}
        </Button>
      </div>

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleKeepEditing();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes to this employee. Save them before leaving, or discard
              them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleKeepEditing} disabled={leaveSaving}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDiscardAndLeave}
              disabled={leaveSaving}
            >
              Discard changes
            </Button>
            <Button type="button" onClick={handleSaveAndLeave} disabled={leaveSaving}>
              {leaveSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
