export function Bars({ items, fmt }: { items: { name: string; n: number; sub?: string }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...items.map(i => i.n))
  return <ul className="flex flex-col gap-2">{items.map(i => <li key={i.name}><div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{i.name}</span><span className="shrink-0 text-slate-400">{fmt ? fmt(i.n) : i.n}{i.sub ? ` · ${i.sub}` : ''}</span></div><div className="h-2 rounded-full bg-slate-700"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${(i.n / max) * 100}%` }} /></div></li>)}</ul>
}
export function DayBars({ days }: { days: { day: string; delivered: number }[] }) {
  const max = Math.max(1, ...days.map(x => x.delivered))
  return <div className="flex h-28 items-end gap-1">{days.map(d => <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1"><span className="text-[10px] text-slate-400">{d.delivered}</span><div className="w-full rounded-t bg-orange-500" style={{ height: `${Math.max(4, (d.delivered / max) * 100)}%` }} /><span className="text-[10px] text-slate-500">{d.day.slice(8)}/{d.day.slice(5, 7)}</span></div>)}</div>
}
