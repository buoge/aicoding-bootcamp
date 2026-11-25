import os
import selectors
import signal
import subprocess
import sys

import pytest


@pytest.mark.parametrize("stop_signal", [signal.SIGINT, signal.SIGTERM])
def test_worker_starts_without_services_and_stops_cleanly(stop_signal: int) -> None:
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    process = subprocess.Popen(
        [sys.executable, "-m", "compass_worker"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
    )
    try:
        assert process.stdout is not None
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            assert selector.select(timeout=10), "Worker did not become ready"
            assert (
                "Worker scaffold ready; no task consumers configured" in process.stdout.readline()
            )
        process.send_signal(stop_signal)
        output, _ = process.communicate(timeout=10)
        assert process.returncode == 0, output
        assert "Worker stopped" in output
    finally:
        if process.poll() is None:
            process.kill()
        process.communicate()
