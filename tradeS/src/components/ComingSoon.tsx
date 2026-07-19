export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-8 text-center">
      <h1 className="mb-2 text-lg font-semibold text-zinc-100">{title}</h1>
      <p className="text-sm text-zinc-500">Coming in {phase} of the build.</p>
    </div>
  );
}
