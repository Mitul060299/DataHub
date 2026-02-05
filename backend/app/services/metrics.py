from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from prometheus_client import Counter, Histogram, Gauge

REQUEST_COUNT = Counter(
    "datahub_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "datahub_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
)

REQUEST_IN_PROGRESS = Gauge(
    "datahub_http_requests_in_progress",
    "HTTP requests in progress",
    ["method", "path"],
)


@dataclass
class RequestTimer:
    method: str
    path: str
    start_time: float

    def observe(self, status_code: int) -> None:
        duration = time.time() - self.start_time
        REQUEST_LATENCY.labels(self.method, self.path).observe(duration)
        REQUEST_COUNT.labels(self.method, self.path, str(status_code)).inc()
        REQUEST_IN_PROGRESS.labels(self.method, self.path).dec()


def start_timer(method: str, path: str) -> RequestTimer:
    REQUEST_IN_PROGRESS.labels(method, path).inc()
    return RequestTimer(method=method, path=path, start_time=time.time())
