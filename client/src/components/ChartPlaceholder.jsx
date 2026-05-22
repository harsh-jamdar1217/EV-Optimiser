export default function ChartPlaceholder({ title }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="text-white font-semibold">{title}</div>
      <div className="mt-2 text-sm text-white/60">Chart placeholder</div>
    </div>
  );
}

