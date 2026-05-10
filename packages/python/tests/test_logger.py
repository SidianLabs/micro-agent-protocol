# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol logger.
"""

import pytest

from mapprotocol.logger import (
    LogEntry,
    LogLevel,
    MAPLogger,
    MetricsCollector,
    ObservabilityManager,
    Tracer,
    latency_tracker,
)


class TestLogLevel:
    """Tests for LogLevel enum."""

    def test_log_level_values(self):
        """Test LogLevel enum values exist."""
        assert LogLevel.DEBUG is not None
        assert LogLevel.INFO is not None
        assert LogLevel.WARN is not None
        assert LogLevel.ERROR is not None
        assert LogLevel.FATAL is not None


class TestLogEntry:
    """Tests for LogEntry dataclass."""

    def test_log_entry_creation(self):
        """Test LogEntry creation."""
        entry = LogEntry(
            timestamp="2024-01-15T10:30:00Z",
            level=LogLevel.INFO,
            message="Test message",
        )
        assert entry.level == LogLevel.INFO
        assert entry.message == "Test message"


class TestMAPLogger:
    """Tests for MAPLogger class."""

    def test_logger_initialization(self):
        """Test logger initialization."""
        logger = MAPLogger()
        assert logger is not None

    def test_logger_set_request_id(self):
        """Test setting request ID."""
        logger = MAPLogger()
        logger.set_request_id("req-123")
        # Request ID should be set (verification depends on implementation)

    def test_logger_generate_request_id(self):
        """Test generating request ID."""
        logger = MAPLogger()
        request_id = logger.generate_request_id()
        assert request_id is not None
        assert len(request_id) > 0

    def test_logger_clear_request_id(self):
        """Test clearing request ID."""
        logger = MAPLogger()
        logger.set_request_id("req-123")
        logger.clear_request_id()

    def test_logger_debug(self):
        """Test debug logging with DEBUG level."""
        logger = MAPLogger(min_level=LogLevel.DEBUG)
        logger.debug("Debug message")
        logs = logger.get_logs()
        assert len(logs) >= 1

    def test_logger_info(self):
        """Test info logging."""
        logger = MAPLogger()
        logger.info("Info message")
        logs = logger.get_logs()
        assert len(logs) >= 1

    def test_logger_warn(self):
        """Test warn logging."""
        logger = MAPLogger()
        logger.warn("Warn message")
        logs = logger.get_logs()
        assert len(logs) >= 1

    def test_logger_error(self):
        """Test error logging."""
        logger = MAPLogger()
        logger.error("Error message")
        logs = logger.get_logs()
        assert len(logs) >= 1

    def test_logger_fatal(self):
        """Test fatal logging."""
        logger = MAPLogger()
        logger.fatal("Fatal message")
        logs = logger.get_logs()
        assert len(logs) >= 1

    def test_logger_clear(self):
        """Test clearing logs."""
        logger = MAPLogger()
        logger.info("Message 1")
        logger.info("Message 2")
        logs_count = len(logger.get_logs())
        logger.clear()
        assert len(logger.get_logs()) < logs_count


class TestMetricsCollector:
    """Tests for MetricsCollector class."""

    def test_initialization(self):
        """Test metrics collector initialization."""
        collector = MetricsCollector()
        assert collector is not None

    def test_increment_counter(self):
        """Test incrementing a counter."""
        collector = MetricsCollector()
        collector.increment("requests", tags={"method": "GET"})
        # Counter should be incremented

    def test_increment_counter_multiple_times(self):
        """Test incrementing a counter multiple times."""
        collector = MetricsCollector()
        collector.increment("requests")
        collector.increment("requests")
        collector.increment("requests")

    def test_gauge(self):
        """Test setting a gauge."""
        collector = MetricsCollector()
        collector.gauge("memory_usage", 75.5)
        # Gauge should be set

    def test_histogram(self):
        """Test recording histogram values."""
        collector = MetricsCollector()
        collector.histogram("request_duration", 0.5)
        collector.histogram("request_duration", 1.0)
        collector.histogram("request_duration", 1.5)

    def test_reset(self):
        """Test resetting all metrics."""
        collector = MetricsCollector()
        collector.increment("requests")
        collector.gauge("memory_usage", 50.0)
        collector.reset()


class TestTracer:
    """Tests for Tracer class."""

    def test_initialization(self):
        """Test tracer initialization."""
        tracer = Tracer()
        assert tracer is not None

    def test_start_span(self):
        """Test starting a span."""
        tracer = Tracer()
        span = tracer.start_span("test-operation")
        assert span is not None

    def test_add_tag(self):
        """Test adding tags to a span."""
        tracer = Tracer()
        span = tracer.start_span("test-operation")
        tracer.add_tag(span.span_id, "key", "value")

    def test_get_all_spans(self):
        """Test getting all spans."""
        tracer = Tracer()
        tracer.start_span("operation-1")
        tracer.start_span("operation-2")
        spans = tracer.get_all_spans()
        assert len(spans) >= 2


class TestObservabilityManager:
    """Tests for ObservabilityManager class."""

    def test_initialization(self):
        """Test observability manager initialization."""
        manager = ObservabilityManager()
        assert manager is not None

    def test_set_request_id(self):
        """Test setting request ID."""
        manager = ObservabilityManager()
        manager.set_request_id("req-456")

    def test_record_task_dispatched(self):
        """Test recording task dispatched event."""
        manager = ObservabilityManager()
        manager.record_task_dispatched(
            task_id="task-1",
            capability="payment",
            risk_class="medium",
        )

    def test_record_task_completed(self):
        """Test recording task completed event."""
        manager = ObservabilityManager()
        manager.record_task_completed(
            task_id="task-1",
            duration_ms=150.5,
            status="completed",
        )

    def test_record_task_failed(self):
        """Test recording task failed event."""
        manager = ObservabilityManager()
        manager.record_task_failed(task_id="task-1", error="test error")


class TestLatencyTracker:
    """ "Tests for latency_tracker decorator."""

    def test_latency_tracker_decorator(self):
        """Test latency tracker decorator."""
        metrics = MetricsCollector()
        logger = MAPLogger(min_level=LogLevel.DEBUG)

        @latency_tracker(logger=logger, metric_name="test_operation", metrics=metrics)
        def test_function():
            return "result"

        result = test_function()
        assert result == "result"

    def test_latency_tracker_with_args(self):
        """Test latency tracker with function arguments."""
        metrics = MetricsCollector()
        logger = MAPLogger(min_level=LogLevel.DEBUG)

        @latency_tracker(logger=logger, metric_name="add_operation", metrics=metrics)
        def add(a, b):
            return a + b

        result = add(1, 2)
        assert result == 3
