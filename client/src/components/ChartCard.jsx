export default function ChartCard({ title, children }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

