export default function Loader({ text = 'Loading...' }) {
  return (
    <div className="flex items-center gap-3 text-white/70">
      <div className="h-4 w-4 rounded-full border-2 border-emerald-300/40 border-t-emerald-300 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

