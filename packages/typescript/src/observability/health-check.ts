/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HealthStatus, VersionInfo } from '../generated-map-types.js';

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  timestamp: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

/**
 * Health check interface
 */
export interface HealthCheck {
  name: string;
  check(): Promise<HealthCheckResult>;
}

/**
 * HTTP health check
 */
export class HTTPHealthCheck implements HealthCheck {
  name: string;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly expectedStatus: number;

  constructor(
    name: string,
    url: string,
    options?: {
      timeoutMs?: number;
      expectedStatus?: number;
    }
  ) {
    this.name = name;
    this.url = url;
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.expectedStatus = options?.expectedStatus ?? 200;
  }

  async check(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(this.url, {
        signal: controller.signal,
        method: 'GET',
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - start;

      if (response.status === this.expectedStatus) {
        return {
          status: 'pass',
          message: `HTTP ${response.status} from ${this.url}`,
          timestamp: new Date().toISOString(),
          durationMs,
        };
      }

      return {
        status: 'fail',
        message: `Expected ${this.expectedStatus}, got ${response.status}`,
        timestamp: new Date().toISOString(),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      return {
        status: 'fail',
        message: `Failed to connect: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        durationMs,
      };
    }
  }
}

/**
 * WebSocket health check
 */
export class WebSocketHealthCheck implements HealthCheck {
  name: string;
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(
    name: string,
    url: string,
    options?: {
      timeoutMs?: number;
    }
  ) {
    this.name = name;
    this.url = url;
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  async check(): Promise<HealthCheckResult> {
    const start = Date.now();
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(this.url);

        const timeoutId = setTimeout(() => {
          ws.close();
          resolve({
            status: 'fail',
            message: 'Connection timeout',
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - start,
          });
        }, this.timeoutMs);

        ws.onopen = () => {
          clearTimeout(timeoutId);
          ws.close();
          resolve({
            status: 'pass',
            message: 'WebSocket connected successfully',
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - start,
          });
        };

        ws.onerror = () => {
          clearTimeout(timeoutId);
          resolve({
            status: 'fail',
            message: 'WebSocket connection failed',
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - start,
          });
        };
      } catch (error) {
        resolve({
          status: 'fail',
          message: `WebSocket error: ${(error as Error).message}`,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - start,
        });
      }
    });
  }
}

/**
 * TCP health check
 */
export class TCPHealthCheck implements HealthCheck {
  name: string;
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(
    name: string,
    host: string,
    port: number,
    options?: {
      timeoutMs?: number;
    }
  ) {
    this.name = name;
    this.host = host;
    this.port = port;
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  async check(): Promise<HealthCheckResult> {
    const start = Date.now();
    // Node.js TCP check using net module
    try {
      const { default: net } = await import('node:net');
      return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            socket.destroy();
          }
        };

        socket.setTimeout(this.timeoutMs);

        socket.on('connect', () => {
          cleanup();
          resolve({
            status: 'pass',
            message: `TCP connection to ${this.host}:${this.port} succeeded`,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - start,
          });
        });

        socket.on('timeout', () => {
          cleanup();
          resolve({
            status: 'fail',
            message: `TCP connection to ${this.host}:${this.port} timed out`,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - start,
          });
        });

        socket.on('error', (err) => {
          cleanup();
          resolve({
            status: 'fail',
            message: `TCP connection to ${this.host}:${this.port} failed: ${err.message}`,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - start,
          });
        });

        socket.connect(this.port, this.host);
      });
    } catch (error) {
      return {
        status: 'fail',
        message: `TCP check failed: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }
}

/**
 * Custom health check function
 */
export class FunctionalHealthCheck implements HealthCheck {
  name: string;
  private readonly checkFn: () => Promise<HealthCheckResult>;

  constructor(name: string, checkFn: () => Promise<HealthCheckResult>) {
    this.name = name;
    this.checkFn = checkFn;
  }

  async check(): Promise<HealthCheckResult> {
    return this.checkFn();
  }
}

/**
 * Health check aggregator
 */
export class HealthCheckAggregator {
  private checks: HealthCheck[] = [];
  private readonly versionInfo: VersionInfo;

  constructor(_serviceName: string, versionInfo: VersionInfo) {
    this.versionInfo = versionInfo;
  }

  /**
   * Add a health check
   */
  addCheck(check: HealthCheck): void {
    this.checks.push(check);
  }

  /**
   * Add multiple health checks
   */
  addChecks(checks: HealthCheck[]): void {
    this.checks.push(...checks);
  }

  /**
   * Run all health checks
   */
  async checkAll(): Promise<HealthStatus> {
    const results = await Promise.all(
      this.checks.map(async (check) => {
        try {
          const result = await check.check();
          return { name: check.name, ...result };
        } catch (error) {
          return {
            name: check.name,
            status: 'fail' as const,
            message: `Check threw exception: ${(error as Error).message}`,
            timestamp: new Date().toISOString(),
          };
        }
      })
    );

    const checks: HealthStatus['checks'] = {};
    for (const result of results) {
      checks[result.name] = {
        status: result.status,
        message: result.message,
        timestamp: result.timestamp,
      };
    }

    // Determine overall status
    const hasFailure = results.some(r => r.status === 'fail');
    const hasWarning = results.some(r => r.status === 'warn');

    const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
      hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy';

    return {
      status: overallStatus,
      version: this.versionInfo,
      uptime_ms: process.uptime() * 1000,
      checks,
    };
  }
}

/**
 * Builder for health check aggregator
 */
export class HealthCheckBuilder {
  private checks: HealthCheck[] = [];
  private serviceName: string = 'map-service';
  private versionInfo: VersionInfo = {
    protocol: '1.0.0',
    schema: '1.0.0',
    transport: '1.0.0',
  };

  /**
   * Set the service name
   */
  withServiceName(name: string): this {
    this.serviceName = name;
    return this;
  }

  /**
   * Set version info
   */
  withVersion(info: VersionInfo): this {
    this.versionInfo = info;
    return this;
  }

  /**
   * Add HTTP health check
   */
  addHTTP(name: string, url: string, options?: { timeoutMs?: number; expectedStatus?: number }): this {
    this.checks.push(new HTTPHealthCheck(name, url, options));
    return this;
  }

  /**
   * Add WebSocket health check
   */
  addWebSocket(name: string, url: string, options?: { timeoutMs?: number }): this {
    this.checks.push(new WebSocketHealthCheck(name, url, options));
    return this;
  }

  /**
   * Add TCP health check
   */
  addTCP(name: string, host: string, port: number, options?: { timeoutMs?: number }): this {
    this.checks.push(new TCPHealthCheck(name, host, port, options));
    return this;
  }

  /**
   * Add custom health check
   */
  addCheck(name: string, checkFn: () => Promise<HealthCheckResult>): this {
    this.checks.push(new FunctionalHealthCheck(name, checkFn));
    return this;
  }

  /**
   * Build the health check aggregator
   */
  build(): HealthCheckAggregator {
    const aggregator = new HealthCheckAggregator(this.serviceName, this.versionInfo);
    aggregator.addChecks(this.checks);
    return aggregator;
  }
}
