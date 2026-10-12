// Mapinha estático feito com 9 blocos do OpenStreetMap (sem biblioteca nem chave de API).
export default function MiniMap({ lat, lng, href, label }: { lat: number; lng: number; href: string; label: string }) {
  const z = 16, n = 2 ** z, rad = (lat * Math.PI) / 180
  const x = ((lng + 180) / 360) * n
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  const tx = Math.floor(x), ty = Math.floor(y), fx = x - tx, fy = y - ty
  const tiles = []
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) tiles.push({ i, j })
  return (
    <a href={href} target="_blank" rel="noreferrer" className="relative block h-36 overflow-hidden rounded-xl bg-slate-600">
      <div className="absolute" style={{ left: '50%', top: '50%', width: 768, height: 768, transform: `translate(${-(256 + fx * 256)}px, ${-(256 + fy * 256)}px)` }}>
        {tiles.map(({ i, j }) => (
          <img key={`${i},${j}`} alt="" loading="lazy" draggable={false} width={256} height={256}
            src={`https://tile.openstreetmap.org/${z}/${tx + i}/${ty + j}.png`}
            style={{ position: 'absolute', left: (i + 1) * 256, top: (j + 1) * 256 }} />
        ))}
      </div>
      <svg width="28" height="38" viewBox="0 0 28 38" className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-100%)' }}>
        <path d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 38 14 38s14-14 14-24.2C28 6.2 21.7 0 14 0Z" fill="#f97316" /><circle cx="14" cy="14" r="5.5" fill="#fff" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 bg-white/95 px-3 py-2 text-slate-900">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-500">Toque para abrir no mapa</p>
      </div>
      <span className="absolute right-1 top-1 rounded bg-white/80 px-1 text-[10px] text-slate-700">© OpenStreetMap</span>
    </a>
  )
}
