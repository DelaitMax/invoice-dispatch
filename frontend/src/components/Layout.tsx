import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/Button";
import { ToastViewport } from "@/features/toasts/ToastViewport";
import { useGetCurrentUserQuery, useLogoutMutation } from "@/features/auth/authApi";
import { useGetReadinessQuery } from "@/services/healthApi";

function HealthDot() {
  const { data, isError, isLoading } = useGetReadinessQuery(undefined, { pollingInterval: 30_000 });
  const ready = !isError && data?.status === "ok";

  const color = isLoading ? "bg-ink-faint" : ready ? "bg-success" : "bg-danger";
  const label = isLoading ? "Проверяем сервис…" : ready ? "Сервис доступен" : "Сервис недоступен";

  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-muted" title={label}>
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function UserMenu() {
  const { data: user } = useGetCurrentUserQuery();
  const [logout, { isLoading }] = useLogoutMutation();

  if (!user) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-ink-muted">
        {user.email}
        {user.role === "admin" && (
          <span className="ml-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">admin</span>
        )}
      </span>
      <Button variant="secondary" disabled={isLoading} onClick={() => void logout()}>
        Выйти
      </Button>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="text-sm font-semibold text-ink">
            Invoice Dispatch
          </Link>
          <div className="flex items-center gap-4">
            <HealthDot />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>
      <ToastViewport />
    </div>
  );
}
