export function AuthLoadingScreen() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-slate-50 p-6"
      role="status"
      aria-label="正在确认登录状态"
    >
      <div className="w-full max-w-5xl space-y-4" aria-hidden="true">
        <div className="h-9 w-48 animate-pulse rounded-md bg-slate-200" />
        <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white" />
          <div className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white" />
        </div>
      </div>
    </div>
  );
}
