import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from './clients'
import { refresh } from './routes'
import { stopsMap } from './stats'

/** Rotas e paradas guardadas no aparelho; atualiza do servidor ao abrir a tela. */
export function useRouteData() {
  const routes = useLiveQuery(() => localDb.routes.toArray(), [])
  const stops = useLiveQuery(() => localDb.stops.toArray(), [])
  useEffect(() => { void refresh() }, [])
  const by = useMemo(() => stopsMap(stops ?? []), [stops])
  return { routes: routes ?? [], by, ready: routes !== undefined }
}
