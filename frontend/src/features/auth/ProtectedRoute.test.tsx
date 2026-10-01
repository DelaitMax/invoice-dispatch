import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { useGetCurrentUserQuery } from "@/features/auth/authApi";

vi.mock("@/features/auth/authApi", () => ({
  useGetCurrentUserQuery: vi.fn(),
}));

const mockedUseGetCurrentUserQuery = vi.mocked(useGetCurrentUserQuery);

function renderProtected(requireAdmin = false) {
  render(
    <MemoryRouter initialEntries={[requireAdmin ? "/admin" : "/protected"]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/" element={<p>home page</p>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <p>secret content</p>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <p>secret content</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("shows a spinner while the session check is loading", () => {
    mockedUseGetCurrentUserQuery.mockReturnValue({ isLoading: true, isError: false } as never);
    renderProtected();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to /login when there is no session", () => {
    mockedUseGetCurrentUserQuery.mockReturnValue({ isLoading: false, isError: true } as never);
    renderProtected();
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders the protected content for a logged-in user", () => {
    mockedUseGetCurrentUserQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { id: "1", email: "a@example.com", role: "user" },
    } as never);
    renderProtected();
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("redirects a non-admin away from a requireAdmin route", () => {
    mockedUseGetCurrentUserQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { id: "1", email: "a@example.com", role: "user" },
    } as never);
    renderProtected(true);
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  it("renders requireAdmin content for an admin", () => {
    mockedUseGetCurrentUserQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { id: "1", email: "a@example.com", role: "admin" },
    } as never);
    renderProtected(true);
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });
});
