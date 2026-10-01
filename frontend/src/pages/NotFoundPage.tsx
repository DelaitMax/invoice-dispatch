import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-lg font-semibold">Страница не найдена</p>
      <Link to="/" className="text-sm text-accent hover:underline">
        На главную
      </Link>
    </div>
  );
}
