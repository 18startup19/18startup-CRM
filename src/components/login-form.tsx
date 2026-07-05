"use client";

import { useActionState } from "react";
import { loginAction, type LoginResult } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, FieldError, FieldLabel, Input } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

const initialState: LoginResult = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-brand-charcoal">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <Logo onDark size="lg" />
        </div>

        <Card className="p-8 sm:p-10 border-0">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[1px] text-brand-orange">
            CRM
          </div>
          <h1 className="text-[22px] font-black text-black leading-tight mb-2">Sign in</h1>
          <p className="text-[14px] text-brand-dark-text leading-relaxed mb-8">
            Enter your 18startup CRM credentials.
          </p>

          <form action={formAction} className="flex flex-col gap-5">
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@18startup.in"
                required
                autoComplete="username"
              />
            </div>

            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {state?.error && (
              <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
                <FieldError>{state.error}</FieldError>
              </div>
            )}

            <Button type="submit" size="lg" disabled={isPending} className="w-full mt-2">
              {isPending ? "Signing in..." : "Sign In →"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
