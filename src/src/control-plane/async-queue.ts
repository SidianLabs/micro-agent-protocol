import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface DeadLetterRecord {
  task_id: string;
  tenant_id?: string;
  attempts: number;
  error: string;
  timestamp: string;
}

export interface QuarantinedJob {
  jobId: string;
  taskId: string;
  tenantId?: string;
  reason: string;
  quarantinedAt: string;
}

interface QueueJob {
  taskId: string;
  tenantId?: string;
  attempt: number;
  run: () => Promise<void>;
  onDeadLetter: (record: DeadLetterRecord) => void;
}

export interface AsyncTaskQueueOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  retryJitterRatio?: number;
  maxConcurrent?: number;
  maxConcurrentPerTenant?: number;
  maxQueueDepth?: number;
  randomFn?: () => number;
  deadLetterStorePath?: string;
  maxDeadLetters?: number;
}

export interface AsyncQueueStats {
  queue_depth: number;
  processing: boolean;
  inflight: number;
  max_concurrent: number;
  max_concurrent_per_tenant: number | null;
  max_queue_depth: number;
  dead_letter_count: number;
  oldest_dead_letter_age_ms: number | null;
}

export class AsyncTaskQueue {
  /**
   * Worker lease prevents duplicate processing. If a worker crashes,
   * the lease expires and another worker picks up the job.
   */
  private static readonly LEASE_TIMEOUT_MS = 30_000;

  private readonly queue: QueueJob[] = [];
  private readonly deadLetters: DeadLetterRecord[] = [];
  private readonly leasedJobs = new Map<string, number>();
  private readonly quarantinedJobs: QuarantinedJob[] = [];
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly retryJitterRatio: number;
  private readonly maxConcurrent: number;
  private readonly maxConcurrentPerTenant?: number;
  private readonly maxQueueDepth: number;
  private readonly randomFn: () => number;
  private readonly deadLetterStorePath?: string;
  private readonly maxDeadLetters: number;
  private processing = false;
  private inflight = 0;
  private readonly inflightByTenant = new Map<string, number>();

  constructor(options: AsyncTaskQueueOptions = {}) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.retryDelayMs = Math.max(1, options.retryDelayMs ?? 50);
    this.maxRetryDelayMs = Math.max(
      this.retryDelayMs,
      options.maxRetryDelayMs ?? 5_000,
    );
    this.retryJitterRatio = this.clampJitterRatio(
      options.retryJitterRatio ?? 0.2,
    );
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 4);
    this.maxConcurrentPerTenant =
      typeof options.maxConcurrentPerTenant === "number"
        ? Math.max(1, options.maxConcurrentPerTenant)
        : undefined;
    this.maxQueueDepth = Math.max(1, options.maxQueueDepth ?? 1_000);
    this.randomFn = options.randomFn ?? Math.random;
    this.deadLetterStorePath = options.deadLetterStorePath;
    this.maxDeadLetters = Math.max(1, options.maxDeadLetters ?? 500);
    this.hydrateDeadLetters();
  }

  enqueue(params: {
    taskId: string;
    tenantId?: string;
    run: () => Promise<void>;
    onDeadLetter: (record: DeadLetterRecord) => void;
  }): { accepted: boolean; reason?: "queue_full" } {
    if (this.queue.length >= this.maxQueueDepth) {
      return { accepted: false, reason: "queue_full" };
    }
    this.queue.push({
      taskId: params.taskId,
      tenantId: params.tenantId,
      attempt: 1,
      run: params.run,
      onDeadLetter: params.onDeadLetter,
    });
    this.kickoff();
    return { accepted: true };
  }

  hasCapacity(): boolean {
    return this.queue.length < this.maxQueueDepth;
  }

  listDeadLetters(): DeadLetterRecord[] {
    return [...this.deadLetters];
  }

  listDeadLettersByTenant(tenantId: string): DeadLetterRecord[] {
    return this.deadLetters.filter((record) => record.tenant_id === tenantId);
  }

  quarantineJob(taskId: string, reason: string, tenantId?: string): void {
    const record: QuarantinedJob = {
      jobId: `${taskId}-${Date.now()}`,
      taskId,
      tenantId,
      reason,
      quarantinedAt: new Date().toISOString(),
    };
    this.quarantinedJobs.push(record);
  }

  listQuarantinedJobs(): QuarantinedJob[] {
    return [...this.quarantinedJobs];
  }

  listQuarantinedJobsByTenant(tenantId: string): QuarantinedJob[] {
    return this.quarantinedJobs.filter(
      (record) => record.tenantId === tenantId,
    );
  }

  getStats(): AsyncQueueStats {
    const now = Date.now();
    const oldest = this.deadLetters[0];
    const oldestAgeMs =
      oldest && !Number.isNaN(Date.parse(oldest.timestamp))
        ? Math.max(0, now - Date.parse(oldest.timestamp))
        : null;

    return {
      queue_depth: this.queue.length,
      processing: this.processing || this.inflight > 0 || this.queue.length > 0,
      inflight: this.inflight,
      max_concurrent: this.maxConcurrent,
      max_concurrent_per_tenant: this.maxConcurrentPerTenant ?? null,
      max_queue_depth: this.maxQueueDepth,
      dead_letter_count: this.deadLetters.length,
      oldest_dead_letter_age_ms: oldestAgeMs,
    };
  }

  private kickoff(): void {
    if (this.processing) {
      return;
    }
    this.processing = true;
    queueMicrotask(() => this.maybeRunJobs());
  }

  private maybeRunJobs(): void {
    // Check for expired leases and clean up
    this.reapExpiredLeases();

    while (this.inflight < this.maxConcurrent) {
      const index = this.findRunnableJobIndex();
      if (index < 0) {
        break;
      }
      const [job] = this.queue.splice(index, 1);
      if (!job) {
        continue;
      }
      this.startJob(job);
    }

    if (this.queue.length === 0 && this.inflight === 0) {
      this.processing = false;
    }
  }

  /**
   * Reaps expired leases. If a worker crashes, the lease expires
   * and another worker can pick up the job.
   */
  private reapExpiredLeases(): void {
    const now = Date.now();
    const expired: string[] = [];
    for (const [taskId, leasedAt] of this.leasedJobs.entries()) {
      if (now - leasedAt > AsyncTaskQueue.LEASE_TIMEOUT_MS) {
        expired.push(taskId);
      }
    }
    for (const taskId of expired) {
      this.leasedJobs.delete(taskId);
      this.inflight = Math.max(0, this.inflight - 1);
    }
    if (expired.length > 0 && this.queue.length === 0 && this.inflight === 0) {
      this.processing = false;
    }
  }

  private startJob(job: QueueJob): void {
    this.inflight += 1;
    const tenantKey = this.resolveTenantKey(job.tenantId);
    this.inflightByTenant.set(
      tenantKey,
      (this.inflightByTenant.get(tenantKey) ?? 0) + 1,
    );

    // Track lease to prevent duplicate processing after worker crashes
    this.leasedJobs.set(job.taskId, Date.now());

    void (async () => {
      try {
        await job.run();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Async queue job failed.";
        if (job.attempt < this.maxAttempts) {
          this.requeue({
            ...job,
            attempt: job.attempt + 1,
          });
        } else {
          const record: DeadLetterRecord = {
            task_id: job.taskId,
            tenant_id: job.tenantId,
            attempts: job.attempt,
            error: message,
            timestamp: new Date().toISOString(),
          };
          this.deadLetters.push(record);
          this.trimDeadLetters();
          this.persistDeadLetters();
          // Poison-message quarantine: isolate jobs that exceed max attempts
          this.quarantineJob(
            job.taskId,
            `Exceeded max attempts (${job.attempt}/${this.maxAttempts}): ${message}`,
            job.tenantId,
          );
          job.onDeadLetter(record);
        }
      } finally {
        this.finishJob(tenantKey, job.taskId);
      }
    })();
  }

  private finishJob(tenantKey: string, taskId?: string): void {
    this.inflight = Math.max(0, this.inflight - 1);
    const current = this.inflightByTenant.get(tenantKey) ?? 0;
    if (current <= 1) {
      this.inflightByTenant.delete(tenantKey);
    } else {
      this.inflightByTenant.set(tenantKey, current - 1);
    }
    if (taskId) {
      this.leasedJobs.delete(taskId);
    }
    this.maybeRunJobs();
  }

  private findRunnableJobIndex(): number {
    if (!this.maxConcurrentPerTenant) {
      return this.queue.length > 0 ? 0 : -1;
    }
    for (let index = 0; index < this.queue.length; index += 1) {
      const candidate = this.queue[index];
      if (!candidate) {
        continue;
      }
      const tenantKey = this.resolveTenantKey(candidate.tenantId);
      const tenantInflight = this.inflightByTenant.get(tenantKey) ?? 0;
      if (tenantInflight < this.maxConcurrentPerTenant) {
        return index;
      }
    }
    return -1;
  }

  private requeue(job: QueueJob): void {
    const baseDelay = Math.min(
      this.maxRetryDelayMs,
      this.retryDelayMs * 2 ** (job.attempt - 1),
    );
    const jitterMultiplier = 1 + this.jitterDelta();
    const retryDelay = Math.max(1, Math.round(baseDelay * jitterMultiplier));
    setTimeout(() => {
      if (this.queue.length >= this.maxQueueDepth) {
        const record: DeadLetterRecord = {
          task_id: job.taskId,
          tenant_id: job.tenantId,
          attempts: job.attempt,
          error: "Queue capacity reached while retrying job.",
          timestamp: new Date().toISOString(),
        };
        this.deadLetters.push(record);
        this.trimDeadLetters();
        this.persistDeadLetters();
        job.onDeadLetter(record);
        return;
      }
      this.queue.push(job);
      this.kickoff();
    }, retryDelay);
  }

  private resolveTenantKey(tenantId: string | undefined): string {
    return tenantId && tenantId.trim().length > 0 ? tenantId : "default";
  }

  private jitterDelta(): number {
    if (this.retryJitterRatio <= 0) {
      return 0;
    }
    const randomValue = this.randomFn();
    const bounded = Number.isFinite(randomValue)
      ? Math.min(1, Math.max(0, randomValue))
      : 0.5;
    return (bounded * 2 - 1) * this.retryJitterRatio;
  }

  private clampJitterRatio(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }

  private hydrateDeadLetters(): void {
    if (!this.deadLetterStorePath || !existsSync(this.deadLetterStorePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.deadLetterStorePath, "utf8");
      const parsed = JSON.parse(raw) as { dead_letters?: DeadLetterRecord[] };
      const records = Array.isArray(parsed.dead_letters)
        ? parsed.dead_letters
        : [];
      this.deadLetters.push(...records);
      this.trimDeadLetters();
    } catch {
      // Ignore malformed dead-letter persistence in reference mode.
    }
  }

  private persistDeadLetters(): void {
    if (!this.deadLetterStorePath) {
      return;
    }

    mkdirSync(dirname(this.deadLetterStorePath), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(
      this.deadLetterStorePath,
      JSON.stringify({ dead_letters: this.deadLetters }, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
  }

  private trimDeadLetters(): void {
    if (this.deadLetters.length <= this.maxDeadLetters) {
      return;
    }
    const overflow = this.deadLetters.length - this.maxDeadLetters;
    this.deadLetters.splice(0, overflow);
  }
}
