import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/Input";
import { useGetCurrentUserQuery, useLoginMutation } from "@/features/auth/authApi";
import { getApiErrorMessage } from "@/services/apiError";

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: currentUser } = useGetCurrentUserQuery();
  const [login, { isLoading, error }] = useLoginMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await login({ email, password }).unwrap();
      const state = location.state as LocationState | null;
      void navigate(state?.from?.pathname ?? "/", { replace: true });
    } catch {}
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-sm">
        <h1 className="mb-6 text-lg font-semibold">Вход</h1>
        <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label="Пароль"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <ErrorBanner message={getApiErrorMessage(error, "Не удалось войти")} />}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Входим…" : "Войти"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-muted">
          Нет аккаунта?{" "}
          <Link to="/register" className="text-accent hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </Card>
    </div>
  );
}
