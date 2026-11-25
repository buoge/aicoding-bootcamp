FROM ghcr.io/astral-sh/uv:0.13.0 AS uv
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim@sha256:531f855bda2c73cd6ef67d56b733b357cea384185b3022bd09f05e002cd144ca
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY pyproject.toml uv.lock ./
COPY apps/agent/pyproject.toml apps/agent/pyproject.toml
COPY apps/memory/pyproject.toml apps/memory/pyproject.toml
COPY apps/worker/pyproject.toml apps/worker/pyproject.toml
COPY tools/data-seed/pyproject.toml tools/data-seed/pyproject.toml
RUN uv sync --frozen --no-dev --package compass-worker --no-install-workspace
COPY apps/worker apps/worker
RUN uv sync --frozen --no-dev --package compass-worker
RUN useradd --create-home --uid 10001 compass
USER compass
ENV PATH="/app/.venv/bin:$PATH"
WORKDIR /app/apps/worker
CMD ["python", "-m", "compass_worker"]
