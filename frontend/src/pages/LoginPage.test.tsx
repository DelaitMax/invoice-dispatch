import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGetCurrentUserQuery, useLoginMutation } from "@/features/auth/authApi";
import { LoginPage } from "@/pages/LoginPage";

vi.mock("@/features/auth/authApi", () => ({
  useGetCurrentUserQuery: vi.fn(),
  useLoginMutation: vi.fn(),
}));

const mockedCurrentUser = vi.mocked(useGetCurrentUserQuery);
const mockedLogin = vi.mocked(useLoginMutation);

function mockLogin(overrides: { unwrap?: () => Promise<unknown>; error?: unknown; isLoading?: boolean } = {}) {
  const trigger = vi.fn(() => ({ unwrap: overrides.unwrap ?? (() => Promise.resolve({})) }));
  mockedLogin.mockReturnValue([trigger, { isLoading: overrides.isLoading ?? false, error: overrides.error }] as never);
  return trigger;
}

function renderLogin(from?: string) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: from ? { from: { pathname: from } } : null }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>home page</p>} />
        <Route path="/somewhere" element={<p>somewhere page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "ops@example.com");
  await user.type(screen.getByLabelText("Пароль"), "correct-horse");
  await user.click(screen.getByRole("button", { name: "Войти" }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    mockedCurrentUser.mockReturnValue({ data: undefined } as never);
  });

  it("submits the credentials and goes home", async () => {
    const trigger = mockLogin();
    renderLogin();
    await fillAndSubmit();

    expect(trigger).toHaveBeenCalledWith({ email: "ops@example.com", password: "correct-horse" });
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it("returns to the page the user was bounced from", async () => {
    mockLogin();
    renderLogin("/somewhere");
    await fillAndSubmit();

    expect(await screen.findByText("somewhere page")).toBeInTheDocument();
  });

  it("stays on the page and shows the server's message when login fails", async () => {
    const error = { status: 401, data: { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } } };
    mockLogin({ unwrap: () => Promise.reject(new Error("request failed")), error });
    renderLogin();
    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    await waitFor(() => expect(screen.queryByText("home page")).not.toBeInTheDocument());
  });

  it("disables the button while a login is in flight", () => {
    mockLogin({ isLoading: true });
    renderLogin();
    expect(screen.getByRole("button", { name: "Входим…" })).toBeDisabled();
  });

  it("mirrors the backend's password length limits", () => {
    mockLogin();
    renderLogin();
    const password = screen.getByLabelText("Пароль");
    expect(password).toHaveAttribute("minLength", "8");
    expect(password).toHaveAttribute("maxLength", "128");
  });

  it("redirects away when there is already a session", () => {
    mockedCurrentUser.mockReturnValue({ data: { id: "1", email: "a@example.com", role: "user" } } as never);
    mockLogin();
    renderLogin();
    expect(screen.getByText("home page")).toBeInTheDocument();
  });
});
