# SPDX-License-Identifier: Apache-2.0
"""
Observability utilities for MAP Protocol.

Provides logging, metrics, and tracing support.
"""

from __future__ import annotations

import json
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import IntEnum
from functools import wraps
from typing import Any, Callable, Dict, List, Optional


class LogLevel(IntEnum):
    """Log levels."""

    DEBUG = 0
    INFO = 1
    WARN = 2
    ERROR = 3
    FATAL = 4


@dataclass
class LogEntry:
    """A single log entry."""

    timestamp: str
    level: LogLevel
    message: str
    context: Optional[Dict[str, Any]] = None
    task_id: Optional[str] = None
    agent_id: Optional[str] = None
    service_name: Optional[str] = None
    request_id: Optional[str] = None


@dataclass
class Metric:
    """A single metric measurement."""

    name: str
    value: float
    unit: str
    tags: Dict[str, str]
    timestamp: str


@dataclass
class TraceSpan:
    """A trace span for distributed tracing."""

    trace_id: str
    span_id: str
    operation_name: str
    start_time: int
    end_time: Optional[int] = None
    tags: Dict[str, str] = field(default_factory=dict)
    logs: List[Dict[str, Any]] = field(default_factory=list)


class MAPLogger:
    """
    Logger for MAP Protocol with structured logging support.

    Supports JSON output, log levels, request correlation, and latency tracking.
    """

    def __init__(
        self,
        service_name: str = "map-protocol",
        min_level: LogLevel = LogLevel.INFO,
        json_output: bool = False,
    ):
        """
        Initialize the logger.

        Args:
            service_name: Name of the service using the logger.
            min_level: Minimum log level to output.
            json_output: If True, output logs as JSON.
        """
        self.service_name = service_name
        self.min_level = min_level
        self.json_output = json_output
        self._logs: List[LogEntry] = []
        self._max_logs = 10000
        self._request_id: Optional[str] = None

    def set_request_id(self, request_id: Optional[str]) -> None:
        """Set the current request ID for correlation."""
        self._request_id = request_id

    def generate_request_id(self) -> str:
        """Generate and set a new request ID."""
        self._request_id = f"req_{uuid.uuid4().hex[:12]}"
        return self._request_id

    def clear_request_id(self) -> None:
        """Clear the current request ID."""
        self._request_id = None

    def debug(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log a DEBUG message."""
        self.log(LogLevel.DEBUG, message, context)

    def info(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log an INFO message."""
        self.log(LogLevel.INFO, message, context)

    def warn(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log a WARN message."""
        self.log(LogLevel.WARN, message, context)

    def error(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log an ERROR message."""
        self.log(LogLevel.ERROR, message, context)

    def fatal(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log a FATAL message."""
        self.log(LogLevel.FATAL, message, context)

    def log(
        self,
        level: LogLevel,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Log a message at the specified level.

        Args:
            level: The log level.
            message: The log message.
            context: Optional context data.
        """
        if level < self.min_level:
            return

        entry = LogEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            level=level,
            message=message,
            context=context or {},
            service_name=self.service_name,
            request_id=self._request_id,
        )

        self._logs.append(entry)
        if len(self._logs) > self._max_logs:
            self._logs.pop(0)

        self._output(entry)

    def _output(self, entry: LogEntry) -> None:
        """Output a log entry."""
        if self.json_output:
            output = {
                "timestamp": entry.timestamp,
                "level": LogLevel(entry.level).name,
                "message": entry.message,
                "service": entry.service_name,
                "request_id": entry.request_id,
            }
            if entry.context:
                output["context"] = entry.context
            if entry.task_id:
                output["task_id"] = entry.task_id
            if entry.agent_id:
                output["agent_id"] = entry.agent_id
            print(json.dumps(output))
        else:
            level_name = LogLevel(entry.level).name
            parts = [
                f"[{entry.timestamp}]",
                f"[{level_name}]",
                f"[{self.service_name}]",
            ]
            if entry.request_id:
                parts.append(f"[{entry.request_id}]")
            parts.append(entry.message)
            if entry.context:
                parts.append(str(entry.context))
            output_str = " ".join(parts)
            if entry.level >= LogLevel.ERROR:
                import sys

                print(output_str, file=sys.stderr)
            else:
                print(output_str)

    def get_logs(
        self,
        filter: Optional[Dict[str, Any]] = None,
    ) -> List[LogEntry]:
        """
        Get logs with optional filtering.

        Args:
            filter: Optional filter criteria (level, task_id, request_id).

        Returns:
            List of matching log entries.
        """
        result = list(self._logs)

        if filter:
            if "level" in filter:
                level = filter["level"]
                if isinstance(level, int):
                    result = [l for l in result if l.level == level]
                elif isinstance(level, str):
                    result = [l for l in result if LogLevel(l.level).name == level]

            if "task_id" in filter:
                result = [l for l in result if l.task_id == filter["task_id"]]

            if "request_id" in filter:
                result = [l for l in result if l.request_id == filter["request_id"]]

        return result

    def clear(self) -> None:
        """Clear all logs."""
        self._logs = []


class MetricsCollector:
    """Collects metrics for monitoring."""

    def __init__(self):
        """Initialize the metrics collector."""
        self._counters: Dict[str, float] = {}
        self._gauges: Dict[str, float] = {}
        self._histograms: Dict[str, List[float]] = {}
        self._metrics: List[Metric] = []

    def increment(
        self,
        name: str,
        value: float = 1,
        tags: Optional[Dict[str, str]] = None,
    ) -> None:
        """
        Increment a counter.

        Args:
            name: Metric name.
            value: Value to increment by.
            tags: Optional tags.
        """
        key = self._make_key(name, tags or {})
        self._counters[key] = self._counters.get(key, 0) + value
        self._record_metric(name, self._counters[key], "count", tags or {})

    def gauge(
        self,
        name: str,
        value: float,
        tags: Optional[Dict[str, str]] = None,
    ) -> None:
        """
        Set a gauge value.

        Args:
            name: Metric name.
            value: Gauge value.
            tags: Optional tags.
        """
        key = self._make_key(name, tags or {})
        self._gauges[key] = value
        self._record_metric(name, value, "gauge", tags or {})

    def histogram(
        self,
        name: str,
        value: float,
        tags: Optional[Dict[str, str]] = None,
    ) -> None:
        """
        Record a histogram value.

        Args:
            name: Metric name.
            value: Value to record.
            tags: Optional tags.
        """
        key = self._make_key(name, tags or {})
        if key not in self._histograms:
            self._histograms[key] = []
        self._histograms[key].append(value)
        if len(self._histograms[key]) > 1000:
            self._histograms[key].pop(0)
        self._record_metric(name, value, "histogram", tags or {})

    def get_counter(
        self,
        name: str,
        tags: Optional[Dict[str, str]] = None,
    ) -> float:
        """Get a counter value."""
        key = self._make_key(name, tags or {})
        return self._counters.get(key, 0)

    def get_gauge(
        self,
        name: str,
        tags: Optional[Dict[str, str]] = None,
    ) -> float:
        """Get a gauge value."""
        key = self._make_key(name, tags or {})
        return self._gauges.get(key, 0)

    def get_histogram_stats(
        self,
        name: str,
        tags: Optional[Dict[str, str]] = None,
    ) -> Optional[Dict[str, float]]:
        """Get histogram statistics."""
        key = self._make_key(name, tags or {})
        values = self._histograms.get(key)
        if not values:
            return None

        sorted_values = sorted(values)
        return {
            "count": len(sorted_values),
            "min": sorted_values[0],
            "max": sorted_values[-1],
            "avg": sum(sorted_values) / len(sorted_values),
            "p50": self._percentile(sorted_values, 0.5),
            "p95": self._percentile(sorted_values, 0.95),
            "p99": self._percentile(sorted_values, 0.99),
        }

    def get_all_metrics(self) -> List[Metric]:
        """Get all recorded metrics."""
        return list(self._metrics)

    def reset(self) -> None:
        """Reset all metrics."""
        self._counters.clear()
        self._gauges.clear()
        self._histograms.clear()
        self._metrics.clear()

    def _make_key(self, name: str, tags: Dict[str, str]) -> str:
        """Create a unique key for a metric with tags."""
        return f"{name}:{json.dumps(tags, sort_keys=True)}"

    def _record_metric(
        self,
        name: str,
        value: float,
        unit: str,
        tags: Dict[str, str],
    ) -> None:
        """Record a metric."""
        self._metrics.append(
            Metric(
                name=name,
                value=value,
                unit=unit,
                tags=tags,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
        )
        if len(self._metrics) > 10000:
            self._metrics.pop(0)

    def _percentile(self, sorted_values: List[float], p: float) -> float:
        """Calculate percentile from sorted values."""
        if not sorted_values:
            return 0
        index = int(len(sorted_values) * p)
        return sorted_values[min(index, len(sorted_values) - 1)]


class Tracer:
    """Distributed tracing support."""

    def __init__(self):
        """Initialize the tracer."""
        self._spans: Dict[str, TraceSpan] = {}

    def start_span(
        self,
        operation_name: str,
        tags: Optional[Dict[str, str]] = None,
    ) -> TraceSpan:
        """
        Start a new trace span.

        Args:
            operation_name: Name of the operation.
            tags: Optional initial tags.

        Returns:
            The created TraceSpan.
        """
        trace_id = self._generate_id()
        span_id = self._generate_id()
        span = TraceSpan(
            trace_id=trace_id,
            span_id=span_id,
            operation_name=operation_name,
            start_time=self._current_time_ms(),
            tags=tags or {},
        )
        self._spans[span_id] = span
        return span

    def end_span(self, span_id: str) -> None:
        """End a span."""
        span = self._spans.get(span_id)
        if span:
            span.end_time = self._current_time_ms()

    def add_tag(self, span_id: str, key: str, value: str) -> None:
        """Add a tag to a span."""
        span = self._spans.get(span_id)
        if span:
            span.tags[key] = value

    def add_log(
        self,
        span_id: str,
        name: str,
        value: Any,
    ) -> None:
        """Add a log entry to a span."""
        span = self._spans.get(span_id)
        if span:
            span.logs.append(
                {
                    "timestamp": self._current_time_ms(),
                    "name": name,
                    "value": value,
                }
            )

    def get_span(self, span_id: str) -> Optional[TraceSpan]:
        """Get a span by ID."""
        return self._spans.get(span_id)

    def get_all_spans(self) -> List[TraceSpan]:
        """Get all spans."""
        return list(self._spans.values())

    def _generate_id(self) -> str:
        """Generate a unique ID."""
        return f"{uuid.uuid4().hex[:16]}"

    def _current_time_ms(self) -> int:
        """Get current time in milliseconds."""
        return int(time.time() * 1000)


class ObservabilityManager:
    """
    Manages observability components for MAP Protocol.

    Provides unified access to logging, metrics, and tracing.
    """

    def __init__(
        self,
        service_name: str = "map-protocol",
        log_level: LogLevel = LogLevel.INFO,
        json_logs: bool = False,
    ):
        """
        Initialize the observability manager.

        Args:
            service_name: Name of the service.
            log_level: Minimum log level.
            json_logs: If True, output logs as JSON.
        """
        self.logger = MAPLogger(service_name, log_level, json_logs)
        self.metrics = MetricsCollector()
        self.tracer = Tracer()

    def set_request_id(self, request_id: str) -> None:
        """Set the current request ID for correlation."""
        self.logger.set_request_id(request_id)

    def generate_request_id(self) -> str:
        """Generate and set a new request ID."""
        return self.logger.generate_request_id()

    def clear_request_id(self) -> None:
        """Clear the current request ID."""
        self.logger.clear_request_id()

    def record_task_dispatched(
        self,
        task_id: str,
        capability: str,
        risk_class: str,
    ) -> None:
        """Record a task dispatch event."""
        self.metrics.increment(
            "map.task.dispatched",
            1,
            {
                "capability": capability,
                "risk_class": risk_class,
            },
        )
        self.logger.info(
            "Task dispatched",
            {
                "task_id": task_id,
                "capability": capability,
                "risk_class": risk_class,
            },
        )

    def record_task_completed(
        self,
        task_id: str,
        duration_ms: float,
        status: str,
    ) -> None:
        """Record a task completion event."""
        self.metrics.increment("map.task.completed", 1, {"status": status})
        self.metrics.histogram("map.task.duration", duration_ms, {"status": status})
        self.logger.info(
            "Task completed",
            {
                "task_id": task_id,
                "duration_ms": duration_ms,
                "status": status,
            },
        )

    def record_task_failed(
        self,
        task_id: str,
        error: str,
    ) -> None:
        """Record a task failure event."""
        self.metrics.increment("map.task.failed", 1, {"error_type": error})
        self.logger.error(
            "Task failed",
            {
                "task_id": task_id,
                "error": error,
            },
        )

    def record_policy_check(
        self,
        task_id: str,
        policy: str,
        result: str,
    ) -> None:
        """Record a policy check event."""
        self.metrics.increment(
            "map.policy.check",
            1,
            {
                "policy": policy,
                "result": result,
            },
        )
        self.logger.debug(
            "Policy check",
            {
                "task_id": task_id,
                "policy": policy,
                "result": result,
            },
        )

    def record_agent_invocation(
        self,
        agent_id: str,
        capability: str,
        duration_ms: float,
    ) -> None:
        """Record an agent invocation event."""
        self.metrics.increment(
            "map.agent.invoked",
            1,
            {
                "agent_id": agent_id,
                "capability": capability,
            },
        )
        self.metrics.histogram(
            "map.agent.duration",
            duration_ms,
            {
                "agent_id": agent_id,
            },
        )


def latency_tracker(
    logger: Optional[MAPLogger] = None,
    metric_name: Optional[str] = None,
    metrics: Optional[MetricsCollector] = None,
):
    """
    Decorator to track latency of a function.

    Args:
        logger: Optional logger to log the latency.
        metric_name: Optional name for the metric.
        metrics: Optional metrics collector.
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                duration_ms = (time.perf_counter() - start) * 1000
                if logger:
                    logger.info(
                        f"{func.__name__} completed",
                        {"duration_ms": round(duration_ms, 2)},
                    )
                if metrics and metric_name:
                    metrics.histogram(metric_name, duration_ms)

        return wrapper

    return decorator


def async_latency_tracker(
    logger: Optional[MAPLogger] = None,
    metric_name: Optional[str] = None,
    metrics: Optional[MetricsCollector] = None,
):
    """
    Decorator to track latency of an async function.

    Args:
        logger: Optional logger to log the latency.
        metric_name: Optional name for the metric.
        metrics: Optional metrics collector.
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                duration_ms = (time.perf_counter() - start) * 1000
                if logger:
                    logger.info(
                        f"{func.__name__} completed",
                        {"duration_ms": round(duration_ms, 2)},
                    )
                if metrics and metric_name:
                    metrics.histogram(metric_name, duration_ms)

        return wrapper

    return decorator
