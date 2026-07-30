import { secureStorage } from '@/lib/secure-storage';

export type TicketKind = 'bug' | 'idea' | 'support';
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved';

export interface SupportTicket {
  id: string;
  ref: string;
  kind: TicketKind;
  subject: string;
  body: string;
  status: TicketStatus;
  createdAt: string;
}

const KEY = 'supotsu.supportTickets';

export async function loadTickets(): Promise<SupportTicket[]> {
  const raw = await secureStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as SupportTicket[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function addTicket(kind: TicketKind, subject: string, body: string): Promise<SupportTicket[]> {
  const list = await loadTickets();
  const n = list.length + 1;
  const ticket: SupportTicket = {
    id: `${Date.now()}`,
    ref: `KZN-${String(1000 + n)}`,
    kind,
    subject,
    body,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  const next = [ticket, ...list];
  await secureStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function reopenTicket(id: string): Promise<SupportTicket[]> {
  const list = await loadTickets();
  const next = list.map((t) => (t.id === id ? { ...t, status: 'open' as TicketStatus } : t));
  await secureStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
