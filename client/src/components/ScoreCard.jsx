export default function ScoreCard({ title, value, subtitle }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/70">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-emerald-300">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-white/60">{subtitle}</div> : null}
    </div>
  );
}

