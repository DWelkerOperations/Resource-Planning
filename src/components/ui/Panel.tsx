type PanelProps = {
  children: React.ReactNode;
  className?: string;
};

export function Panel({ children, className = "" }: PanelProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-soft ${className}`}>
      {children}
    </section>
  );
}
