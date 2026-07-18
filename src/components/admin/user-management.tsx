"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createUser, updateUserRole, deleteUser } from "@/lib/actions/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MoreHorizontal, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  created_at: string;
};

const AddSchema = z.object({
  email: z.string().email("Enter a valid email"),
  full_name: z.string().trim().max(120),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(["admin", "staff"]),
});
type AddValues = z.infer<typeof AddSchema>;

function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AddValues>({
    resolver: zodResolver(AddSchema),
    defaultValues: { email: "", full_name: "", password: "", role: "staff" },
  });

  function onSubmit(values: AddValues) {
    startTransition(async () => {
      const res = await createUser(values);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("User created. They'll set their password on first login.");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" /> Add user
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Creates a back-office account. The user is prompted to change the password on first
              login.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" {...register("full_name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">Temporary password</Label>
              <Input id="u-pass" type="text" {...register("password")} />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff — process payroll, manage employees</SelectItem>
                      <SelectItem value="admin">Admin — full access incl. user management</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const setRole = (role: "admin" | "staff") =>
    startTransition(async () => {
      const res = await updateUserRole(user.id, role);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Role updated to ${role}.`);
      router.refresh();
    });

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4">
        <p className="font-medium">
          {user.full_name || "—"}
          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
        </p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </td>
      <td className="py-3 pr-4">
        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
          {user.role === "admin" ? "Admin" : "Staff"}
        </Badge>
      </td>
      <td className="py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label="User actions" disabled={pending} />}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {user.role === "staff" ? (
              <DropdownMenuItem onClick={() => setRole("admin")}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Make admin
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setRole("staff")} disabled={isSelf}>
                <UserCog className="mr-2 h-4 w-4" /> Make staff
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              disabled={isSelf}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete user
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes their sign-in account. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteUser(user.id);
                    if ("error" in res) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("User deleted.");
                    router.refresh();
                  })
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

export function UserManagement({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Users</CardTitle>
          <CardDescription>Back-office accounts (admin and staff).</CardDescription>
        </div>
        <AddUserDialog />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
