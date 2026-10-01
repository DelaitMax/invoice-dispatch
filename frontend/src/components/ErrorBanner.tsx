export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
      {message}
    </div>
  );
}
