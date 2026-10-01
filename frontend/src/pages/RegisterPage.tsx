import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/Input";
import { useRegisterMutation } from "@/features/auth/authApi";
import { useCurrentUser } from "@/features/auth/useCurrentUser";
import { getApiErrorMessage } from "@/services/apiError";

export function RegisterPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const [register, { isLoading, error }] = useRegisterMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await register({ email, password }).unwrap();
      void navigate("/", { replace: true });
    } catch {}
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">Регистрация</h1>
        <p className="mb-6 text-sm text-ink-muted">Новый аккаунт всегда создаётся с ролью «user».</p>
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
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <ErrorBanner message={getApiErrorMessage(error, "Не удалось зарегистрироваться")} />}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Создаём аккаунт…" : "Зарегистрироваться"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-muted">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
}
