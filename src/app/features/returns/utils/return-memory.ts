import type { ReturnRequestDetails } from './return-request.utils';

/**
 * What this browser sent in each return or exchange request (what was asked per item, whether an
 * item was damaged or wrong, the refund shown), so the request box can show it until the order's
 * `returns` summary carries the same fields. Browser only; a failed read or write is ignored.
 */
const STORAGE_KEY = 'returnRequests';
const MAX_KEPT = 20;

type Saved = Pick<ReturnRequestDetails, 'asked' | 'storeFault' | 'refundEgp'>;

function readAll(): Record<string, Saved> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, Saved>)
      : {};
  } catch {
    return {};
  }
}

export function rememberReturnRequest(requestId: string, details: Saved): void {
  try {
    const all = readAll();
    delete all[requestId];
    const entries = [...Object.entries(all), [requestId, details] as const].slice(-MAX_KEPT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Private window or storage full: the box shows what the order holds.
  }
}

export function savedReturnRequest(requestId: string): Partial<Saved> {
  const saved = readAll()[requestId];
  if (!saved || typeof saved !== 'object') return {};
  const out: { -readonly [K in keyof Saved]?: Saved[K] } = {};
  if (saved.asked && typeof saved.asked === 'object') {
    const asked: Record<string, string> = {};
    for (const [key, value] of Object.entries(saved.asked)) {
      if (typeof value === 'string') asked[key] = value;
    }
    out.asked = asked;
  }
  if (typeof saved.storeFault === 'boolean') out.storeFault = saved.storeFault;
  if (typeof saved.refundEgp === 'number' && Number.isFinite(saved.refundEgp))
    out.refundEgp = saved.refundEgp;
  return out;
}
