// ═══════════════════════════════════════════════════════════════
// Tenant data-quota refresh signal
//
// A successful tenant-scoped mutation never estimates bytes in the browser.
// It only asks active headers to refetch the authoritative post-commit quota.
// ═══════════════════════════════════════════════════════════════

const EVENT_NAME = 'landa:tenant-data-quota-refresh';
const CHANNEL_NAME = 'landa:tenant-data-quota-refresh:v1';
const MUTATION_BURST_DEBOUNCE_MS = 200;

type TenantDataQuotaRefreshDetail = Readonly<{ tenantId: string }>;
type TenantDataQuotaRefreshMessage = Readonly<{
  type: typeof EVENT_NAME;
  tenantId: string;
}>;

type TenantDataQuotaRefreshListener = (tenantId: string) => void;

let broadcastChannel: BroadcastChannel | null | undefined;
const scheduledRefreshes = new Map<string, number>();

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function normalizeTenantId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tenantId = value.trim();
  return tenantId ? tenantId : null;
}

function publishLocal(tenantId: string): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent<TenantDataQuotaRefreshDetail>(EVENT_NAME, {
    detail: { tenantId },
  }));
}

function readBroadcastMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Partial<TenantDataQuotaRefreshMessage>;
  if (message.type !== EVENT_NAME) return null;
  return normalizeTenantId(message.tenantId);
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (broadcastChannel !== undefined) return broadcastChannel;
  if (!isBrowser() || !window.BroadcastChannel) {
    broadcastChannel = null;
    return broadcastChannel;
  }

  try {
    const channel = new window.BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      const tenantId = readBroadcastMessage(event.data);
      if (tenantId) publishLocal(tenantId);
    });
    broadcastChannel = channel;
  } catch {
    // BroadcastChannel is an enhancement for another open tab. The current
    // tab still receives the local event on browsers where it is unavailable.
    broadcastChannel = null;
  }
  return broadcastChannel;
}

/**
 * Coalesce a burst of successful CRUD calls for the same tenant into one
 * authoritative header refetch. No byte total or sensitive payload is shared.
 */
export function scheduleTenantDataQuotaRefresh(tenantIdInput: unknown): void {
  const tenantId = normalizeTenantId(tenantIdInput);
  if (!tenantId || !isBrowser()) return;

  const previousTimer = scheduledRefreshes.get(tenantId);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);

  const timer = window.setTimeout(() => {
    scheduledRefreshes.delete(tenantId);
    publishLocal(tenantId);
    getBroadcastChannel()?.postMessage({ type: EVENT_NAME, tenantId } satisfies TenantDataQuotaRefreshMessage);
  }, MUTATION_BURST_DEBOUNCE_MS);
  scheduledRefreshes.set(tenantId, timer);
}

/** Subscribe an active header to local and same-origin-tab quota changes. */
export function subscribeTenantDataQuotaRefresh(listener: TenantDataQuotaRefreshListener): () => void {
  if (!isBrowser()) return () => undefined;
  getBroadcastChannel();

  const handleEvent = (event: Event) => {
    const tenantId = normalizeTenantId((event as CustomEvent<unknown>).detail &&
      (event as CustomEvent<TenantDataQuotaRefreshDetail>).detail?.tenantId);
    if (tenantId) listener(tenantId);
  };

  window.addEventListener(EVENT_NAME, handleEvent);
  return () => window.removeEventListener(EVENT_NAME, handleEvent);
}
