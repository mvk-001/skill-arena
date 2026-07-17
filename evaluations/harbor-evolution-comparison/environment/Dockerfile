FROM node:22-bookworm-slim

ARG CODEX_VERSION=0.144.0
ARG UV_VERSION=0.8.17

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        bash ca-certificates curl git jq python3 python3-venv ripgrep \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global "@openai/codex@${CODEX_VERSION}"

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
        "uv==${UV_VERSION}" \
        "Pillow==11.3.0" \
        "PyYAML==6.0.2"

ENV PATH="/opt/venv/bin:${PATH}"
