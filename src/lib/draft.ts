import type { ClientDraft } from './clients'
const K = 'rhd:draft'
export type Draft = { id: string | null; data: ClientDraft }
export const loadDraft = (): Draft | null => { try { return JSON.parse(localStorage.getItem(K) || 'null') } catch { return null } }
export const saveDraft = (d: Draft) => { try { localStorage.setItem(K, JSON.stringify(d)) } catch { /* sem armazenamento */ } }
export const clearDraft = () => { try { localStorage.removeItem(K) } catch { /* sem armazenamento */ } }
