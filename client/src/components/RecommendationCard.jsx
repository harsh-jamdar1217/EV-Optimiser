export default function RecommendationCard({ title, children }) {
  return (
    <section className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
      <h3 className="text-emerald-200 font-semibold">{title}</h3>
      <div className="mt-2 text-white/80">{children}</div>
    </section>
  );
}

