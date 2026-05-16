/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Metric value
 */
export interface MetricValue {
  value: number;
  timestamp: number;
  labels: Record<string, string>;
}

/**
 * Base metric interface
 */
export interface Metric {
  name: string;
  help: string;
  type: MetricType;
  values: MetricValue[];
}

/**
 * Counter metric
 */
export interface CounterMetric extends Metric {
  type: 'counter';
}

/**
 * Gauge metric
 */
export interface GaugeMetric extends Metric {
  type: 'gauge';
}

/**
 * Histogram bucket
 */
export interface HistogramBucket {
  le: number;
  count: number;
}

/**
 * Histogram metric
 */
export interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

/**
 * Summary quantile
 */
export interface SummaryQuantile {
  quantile: number;
  value: number;
}

/**
 * Summary metric
 */
export interface SummaryMetric extends Metric {
  type: 'summary';
  quantiles: SummaryQuantile[];
  sum: number;
  count: number;
}

/**
 * Metrics collector options
 */
export interface MetricsCollectorOptions {
  defaultLabels?: Record<string, string>;
  prefix?: string;
}

/**
 * Prometheus metrics collector
 *
 * Collects and stores metrics, supports Prometheus text format export.
 */
export class PrometheusMetricsCollector {
  private readonly prefix: string;
  private readonly defaultLabels: Record<string, string>;
  private counters: Map<string, {
    value: number;
    labels: Record<string, string>;
  }> = new Map();
  private gauges: Map<string, {
    value: number;
    labels: Record<string, string>;
  }> = new Map();
  private histograms: Map<string, {
    values: number[];
    labels: Record<string, string>;
  }> = new Map();
  private summaries: Map<string, {
    values: number[];
    labels: Record<string, string>;
  }> = new Map();

  constructor(options: MetricsCollectorOptions = {}) {
    this.prefix = options.prefix ?? 'map';
    this.defaultLabels = options.defaultLabels ?? {};
  }

  /**
   * Increment a counter
   */
  counterIncrement(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key);
    if (current) {
      current.value += value;
    } else {
      this.counters.set(key, { value, labels });
    }
  }

  /**
   * Set a gauge value
   */
  gaugeSet(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, { value, labels });
  }

  /**
   * Add to a histogram
   */
  histogramObserve(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    const current = this.histograms.get(key);
    if (current) {
      current.values.push(value);
    } else {
      this.histograms.set(key, { values: [value], labels });
    }
  }

  /**
   * Observe for summary
   */
  summaryObserve(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    const current = this.summaries.get(key);
    if (current) {
      current.values.push(value);
    } else {
      this.summaries.set(key, { values: [value], labels });
    }
  }

  /**
   * Get counter value
   */
  counterGet(name: string, labels: Record<string, string> = {}): number {
    const key = this.makeKey(name, labels);
    return this.counters.get(key)?.value ?? 0;
  }

  /**
   * Get gauge value
   */
  gaugeGet(name: string, labels: Record<string, string> = {}): number {
    const key = this.makeKey(name, labels);
    return this.gauges.get(key)?.value ?? 0;
  }

  /**
   * Export all metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];

    // Export counters
    for (const [key, data] of this.counters) {
      const { name, metricLabels } = this.parseKey(key);
      const finalLabels = this.mergeLabels(metricLabels);
      lines.push(`# TYPE ${this.prefix}_${name} counter`);
      lines.push(`# HELP ${this.prefix}_${name} counter metric`);
      lines.push(`${this.prefix}_${name}${this.formatLabels(finalLabels)} ${data.value}`);
    }

    // Export gauges
    for (const [key, data] of this.gauges) {
      const { name, metricLabels } = this.parseKey(key);
      const finalLabels = this.mergeLabels(metricLabels);
      lines.push(`# TYPE ${this.prefix}_${name} gauge`);
      lines.push(`# HELP ${this.prefix}_${name} gauge metric`);
      lines.push(`${this.prefix}_${name}${this.formatLabels(finalLabels)} ${data.value}`);
    }

    // Export histograms
    for (const [key, data] of this.histograms) {
      const { name, metricLabels } = this.parseKey(key);
      const finalLabels = this.mergeLabels(metricLabels);
      lines.push(`# TYPE ${this.prefix}_${name} histogram`);

      const values = data.values;
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;

      const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
      for (const le of buckets) {
        const bucketCount = values.filter(v => v <= le).length;
        lines.push(`${this.prefix}_${name}_bucket${this.formatLabels({ ...finalLabels, le: String(le) })} ${bucketCount}`);
      }
      lines.push(`${this.prefix}_${name}_bucket${this.formatLabels({ ...finalLabels, le: '+Inf' })} ${count}`);
      lines.push(`${this.prefix}_${name}_sum${this.formatLabels(finalLabels)} ${sum}`);
      lines.push(`${this.prefix}_${name}_count${this.formatLabels(finalLabels)} ${count}`);
    }

    // Export summaries
    for (const [key, data] of this.summaries) {
      const { name, metricLabels } = this.parseKey(key);
      const finalLabels = this.mergeLabels(metricLabels);
      lines.push(`# TYPE ${this.prefix}_${name} summary`);

      const values = data.values;
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;

      const quantiles = [0.5, 0.9, 0.95, 0.99];
      const sorted = [...values].sort((a, b) => a - b);
      for (const q of quantiles) {
        const index = Math.ceil(sorted.length * q) - 1;
        const value = sorted[Math.max(0, index)];
        lines.push(`${this.prefix}_${name}_quantile${this.formatLabels({ ...finalLabels, quantile: String(q) })} ${value}`);
      }
      lines.push(`${this.prefix}_${name}_sum${this.formatLabels(finalLabels)} ${sum}`);
      lines.push(`${this.prefix}_${name}_count${this.formatLabels(finalLabels)} ${count}`);
    }

    return lines.join('\n');
  }

  /**
   * Export metrics as JSON
   */
  exportJSON(): string {
    const metrics: (CounterMetric | GaugeMetric | HistogramMetric)[] = [];

    // Convert counters
    for (const [key, data] of this.counters) {
      const { name } = this.parseKey(key);
      metrics.push({
        name: `${this.prefix}_${name}`,
        help: `${name} counter`,
        type: 'counter' as const,
        values: [{
          value: data.value,
          timestamp: Date.now(),
          labels: data.labels,
        }],
      } as CounterMetric);
    }

    // Convert gauges
    for (const [key, data] of this.gauges) {
      const { name } = this.parseKey(key);
      metrics.push({
        name: `${this.prefix}_${name}`,
        help: `${name} gauge`,
        type: 'gauge' as const,
        values: [{
          value: data.value,
          timestamp: Date.now(),
          labels: data.labels,
        }],
      } as GaugeMetric);
    }


    // Convert histograms
    for (const [key, data] of this.histograms) {
      const { name } = this.parseKey(key);
      const values = data.values;
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;


      const histogramBuckets: HistogramBucket[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10].map(le => ({
        le,
        count: values.filter(v => v <= le).length,
      }));

      metrics.push({
        name: `${this.prefix}_${name}`,
        help: `${name} histogram`,
        type: 'histogram' as const,
        values: [{
          value: sum,
          timestamp: Date.now(),
          labels: data.labels,
        }],
        buckets: histogramBuckets,
        sum,
        count,
      } as HistogramMetric);
    }


    return JSON.stringify(metrics, null, 2);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
  }

  private makeKey(name: string, labels: Record<string, string>): string {
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}${sortedLabels ? `{${sortedLabels}}` : ''}`;
  }

  private parseKey(key: string): { name: string; metricLabels: Record<string, string> } {
    const match = key.match(/^([^}{]+)(?:\{(.+)\})?$/);
    if (!match) {
      return { name: key, metricLabels: {} };
    }
    const name = match[1];
    const metricLabels: Record<string, string> = {};
    if (match[2]) {
      const labelPairs = match[2].matchAll(/(\w+)="([^"]*)"/g);
      for (const [, k, v] of labelPairs) {
        metricLabels[k] = v;
      }
    }
    return { name, metricLabels };
  }

  private mergeLabels(labels: Record<string, string>): Record<string, string> {
    return { ...this.defaultLabels, ...labels };
  }

  private formatLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) {
      return '';
    }
    const parts = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${parts}}`;
  }
}

/**
 * Default global metrics collector instance
 */
export const globalMetrics = new PrometheusMetricsCollector();
