import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGetCurrentUserQuery, useRegisterMutation } from "@/features/auth/authApi";
import { RegisterPage } from "@/pages/RegisterPage";

vi.mock("@/features/auth/authApi", () => ({
  useGetCurrentUserQuery: vi.fn(),
  useRegisterMutation: vi.fn(),
}));

const mockedCurrentUser = vi.mocked(useGetCurrentUserQuery);
const mockedRegister = vi.mocked(useRegisterMutation);

function mockRegister(overrides: { unwrap?: () => Promise<unknown>; error?: unknown } = {}) {
  const trigger = vi.fn(() => ({ unwrap: overrides.unwrap ?? (() => Promise.resolve({})) }));
  mockedRegister.mockReturnValue([trigger, { isLoading: false, error: overrides.error }] as never);
  return trigger;
}

function renderRegister() {
  render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(screen.getByLabelText("Пароль"), "correct-horse");
  await user.click(screen.getByRole("button", { name: /Зарегистрироваться|Создать/ }));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    mockedCurrentUser.mockReturnValue({ data: undefined } as never);
  });

  it("submits the credentials and goes home", async () => {
    const trigger = mockRegister();
    renderRegister();
    await fillAndSubmit();

    expect(trigger).toHaveBeenCalledWith({ email: "new@example.com", password: "correct-horse" });
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it("shows the server's message when the email is already taken", async () => {
    const error = { status: 409, data: { error: { code: "EMAIL_TAKEN", message: "Email is already registered" } } };
    mockRegister({ unwrap: () => Promise.reject(new Error("request failed")), error });
    renderRegister();
    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Email is already registered");
    expect(screen.queryByText("home page")).not.toBeInTheDocument();
  });

  it("mirrors the backend's password length limits", () => {
    mockRegister();
    renderRegister();
    const password = screen.getByLabelText("Пароль");
    expect(password).toHaveAttribute("minLength", "8");
    expect(password).toHaveAttribute("maxLength", "128");
  });
});
