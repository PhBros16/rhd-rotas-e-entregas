import { presets, type Range } from '../lib/stats'

export default function Period({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const p = presets()
  const on = (r: Range) => r.from === value.from && r.to === value.to
  const inp = 'min-w-0 flex-1 rounded-lg bg-slate-800 px-2 py-2 text-sm text-slate-200'
  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap gap-2">{p.map(([l, r]) => <button key={l} onClick={() => onChange(r)} className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${on(r) ? 'bg-orange-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`}>{l}</button>)}</div>
      <div className="flex items-center gap-2 text-sm text-slate-400"><span>De</span><input type="date" className={inp} value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} /><span>até</span><input type="date" className={inp} value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} /></div>
    </div>
  )
}
