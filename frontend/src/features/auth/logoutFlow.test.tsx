import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastsReducer } from "@/features/toasts/toastSlice";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { api } from "@/services/api";

const USER = { id: "1", email: "ops@example.com", role: "user" };

let loggedIn = true;
let meCalls = 0;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === "/auth/me") {
    meCalls += 1;
    if (meCalls > 100) return new Promise<Response>(() => {});
    return Promise.resolve(
      loggedIn
        ? json(200, USER)
        : json(401, { error: { code: "NOT_AUTHENTICATED", message: "Authentication required" } }),
    );
  }
  if (url.pathname === "/auth/logout") {
    loggedIn = false;
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (url.pathname === "/health/ready") {
    return Promise.resolve(json(200, { status: "ok", components: { database: "ok", redis: "ok" } }));
  }
  return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "nope" } }));
}

function renderApp() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, toasts: toastsReducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <Layout>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <p>secret home</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Layout>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

describe("logout flow (real RTK Query, faked network)", () => {
  beforeEach(() => {
    loggedIn = true;
    meCalls = 0;
    const NativeRequest = globalThis.Request;
    vi.stubGlobal(
      "Request",
      class extends NativeRequest {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
          super(typeof input === "string" && input.startsWith("/") ? `http://localhost${input}` : input, init);
        }
      },
    );
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lands on the login page after logout and stops asking /auth/me", async () => {
    renderApp();
    expect(await screen.findByText("secret home")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));

    expect(await screen.findByRole("heading", { name: "Вход" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("secret home")).not.toBeInTheDocument();
    expect(screen.queryByText("ops@example.com")).not.toBeInTheDocument();

    const callsAtLogin = meCalls;
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(meCalls).toBe(callsAtLogin);
    expect(meCalls).toBeLessThan(6);
  });

  it("redirects to login, without a request storm, when the session expires on its own", async () => {
    const store = renderApp();
    expect(await screen.findByText("secret home")).toBeInTheDocument();

    loggedIn = false;
    store.dispatch(api.util.invalidateTags(["CurrentUser"]));

    expect(await screen.findByRole("heading", { name: "Вход" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("ops@example.com")).not.toBeInTheDocument();

    const callsAtLogin = meCalls;
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(meCalls).toBe(callsAtLogin);
    expect(meCalls).toBeLessThan(6);
  });
});
