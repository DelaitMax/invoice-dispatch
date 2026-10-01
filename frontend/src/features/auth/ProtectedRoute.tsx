import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useGetCurrentUserQuery } from "@/features/auth/authApi";
import { Spinner } from "@/components/Spinner";

interface ProtectedRouteProps {
  children: ReactElement;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps): ReactElement {
  const location = useLocation();
  const { data: user, isLoading, isError } = useGetCurrentUserQuery();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
