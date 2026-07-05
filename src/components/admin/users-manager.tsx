"use client";

import { useActionState, useState } from "react";
import { Badge, Card, FieldError, FieldLabel, Input, Select } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
  updateUserAction,
  type UserFormResult,
} from "@/app/actions/users";
import { PERMISSIONS, PERMISSION_LABELS, type Permission } from "@/lib/rbac";
import type { PipelineRow, UserRow } from "@/lib/database.types";
import { formatRelative } from "@/lib/utils";

const initial: UserFormResult = {};

export function UsersManager({
  users,
  pipelines,
}: {
  users: UserRow[];
  pipelines: PipelineRow[];
}) {
  const [state, formAction, isPending] = useActionState(createUserAction, initial);
  const [editing, setEditing] = useState<UserRow | null>(null);

  return (
    <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
      <Card className="p-6">
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">Add a user</h2>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="password">Temporary password</FieldLabel>
            <Input id="password" name="password" type="text" minLength={8} required autoComplete="off" />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <Select id="role" name="role" defaultValue="member">
              <option value="member">Team member</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          {state.ok && (
            <div className="bg-[#E7F8EE] border border-[#B7EBCB] rounded-[10px] px-4 py-3 text-[13px] font-semibold text-[#1a8f4c]">
              User created.
            </div>
          )}
          <Button type="submit" size="md" disabled={isPending} className="w-full">
            {isPending ? "Creating..." : "Add user"}
          </Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-brand-bg border-b border-brand-border text-left">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Last login</Th>
              <Th className="w-[80px]" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-brand-border last:border-none">
                <Td className="font-semibold">{u.name}</Td>
                <Td className="text-brand-dark-text">{u.email}</Td>
                <Td>
                  {u.role === "admin" ? (
                    <Badge color="orange">Admin</Badge>
                  ) : (
                    <Badge color="blue">Member</Badge>
                  )}
                </Td>
                <Td>
                  {u.is_active ? (
                    <Badge color="green">Active</Badge>
                  ) : (
                    <Badge color="slate">Disabled</Badge>
                  )}
                </Td>
                <Td className="text-brand-dark-text">{formatRelative(u.last_login_at)}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditing(u)}
                      className="text-[13px] font-bold text-brand-orange hover:text-brand-orange-dark"
                    >
                      Edit
                    </button>
                    {u.is_active && (
                      <form action={deleteUserAction.bind(null, u.id)}>
                        <button
                          type="submit"
                          className="text-[13px] font-bold text-red-500 hover:text-red-600"
                          onClick={(e) => {
                            if (!confirm(`Disable ${u.name}? They can be re-activated later.`))
                              e.preventDefault();
                          }}
                        >
                          Disable
                        </button>
                      </form>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-brand-dark-text">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editing && (
        <EditUserModal
          user={editing}
          pipelines={pipelines}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-6 py-4 align-middle ${className}`}>{children}</td>;
}

function EditUserModal({
  user,
  pipelines,
  onClose,
}: {
  user: UserRow;
  pipelines: PipelineRow[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-[560px] max-h-[90vh] overflow-auto p-8">
        <h2 className="text-[18px] font-black text-brand-charcoal mb-4">Edit {user.name}</h2>
        <form
          action={async (fd) => {
            await updateUserAction(user.id, fd);
            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="e-name">Name</FieldLabel>
            <Input id="e-name" name="name" defaultValue={user.name} required />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="e-role">Role</FieldLabel>
            <Select id="e-role" name="role" defaultValue={user.role}>
              <option value="member">Team member</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-brand-charcoal">
            <input type="checkbox" name="is_active" defaultChecked={user.is_active} />
            Active
          </label>

          <div className="border-t border-brand-border pt-4 mt-2">
            <FieldLabel>Pipeline access (members only)</FieldLabel>
            <p className="text-[12px] text-brand-dark-text mt-1 mb-3">
              Leave all boxes empty to give access to every pipeline. Admins bypass this.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {pipelines.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 text-[13px] text-brand-charcoal"
                >
                  <input
                    type="checkbox"
                    name="pipeline_ids"
                    value={p.id}
                    defaultChecked={(user.pipeline_ids ?? []).includes(p.id)}
                  />
                  {p.name}
                </label>
              ))}
              {pipelines.length === 0 && (
                <div className="text-[12px] text-brand-dark-text col-span-2">
                  No pipelines yet.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-brand-border pt-4 mt-2">
            <FieldLabel>Permissions (members only)</FieldLabel>
            <p className="text-[12px] text-brand-dark-text mt-1 mb-3">
              Admins bypass these — they have everything.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-start gap-2 text-[13px] text-brand-charcoal">
                  <input
                    type="checkbox"
                    name={`perm_${p}`}
                    defaultChecked={user.permissions?.[p as Permission] === true}
                    className="mt-1"
                  />
                  <span>{PERMISSION_LABELS[p as Permission]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button type="button" variant="outline" size="md" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" size="md" className="flex-1">
              Save changes
            </Button>
          </div>
        </form>

        <div className="border-t border-brand-border pt-6 mt-6">
          <FieldLabel>Reset password</FieldLabel>
          <form
            action={async (fd) => {
              await resetPasswordAction(user.id, fd);
              onClose();
            }}
            className="flex gap-3 mt-2"
          >
            <Input name="password" type="text" minLength={8} placeholder="New password (8+ chars)" required />
            <Button type="submit" variant="secondary" size="md">
              Reset
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
