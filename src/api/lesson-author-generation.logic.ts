export interface BlueprintGenerationStatus {
  job_id: string;
  correlation_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress_code: string | null;
  deadline_at: string;
  blueprint_id: string | null;
  assistant_message_id: string | null;
  external_failure_code: string | null;
}

export function readBlueprintGenerationStatus(value: unknown): BlueprintGenerationStatus {
  const v = value as Partial<BlueprintGenerationStatus> | null;
  const uuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  if (!v || !uuid(v.job_id) || !uuid(v.correlation_id)
    || !['queued', 'running', 'succeeded', 'failed', 'canceled'].includes(v.status ?? '')
    || typeof v.deadline_at !== 'string' || !Number.isFinite(Date.parse(v.deadline_at))
    || (v.status === 'succeeded' && (!uuid(v.blueprint_id) || !uuid(v.assistant_message_id)))) {
    throw new Error('GENERATION_STATUS_INVALID');
  }
  return v as BlueprintGenerationStatus;
}

/** No POST/retry capability exists here. Browser cancellation only stops polling. */
export async function pollBlueprintGeneration(input: {
  initial: BlueprintGenerationStatus;
  read: () => Promise<BlueprintGenerationStatus>;
  progress: (status: BlueprintGenerationStatus) => void;
  signal: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<BlueprintGenerationStatus> {
  const now = input.now ?? Date.now;
  const end = Math.min(Date.parse(input.initial.deadline_at) + 60_000, now() + 660_000);
  const sleep = input.sleep ?? ((ms, signal) => new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  }));
  let current = input.initial;
  while (true) {
    input.signal.throwIfAborted();
    input.progress(current);
    if (['succeeded', 'failed', 'canceled'].includes(current.status)) return current;
    if (now() >= end) throw new Error('GENERATION_STATUS_WAIT_EXPIRED');
    await sleep(Math.min(2_000, end - now()), input.signal);
    current = await input.read();
    if (current.job_id !== input.initial.job_id || current.correlation_id !== input.initial.correlation_id) {
      throw new Error('GENERATION_STATUS_IDENTITY_CHANGED');
    }
  }
}
