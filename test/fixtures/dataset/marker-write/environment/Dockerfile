FROM ubuntu:24.04

WORKDIR /app

RUN useradd --create-home --shell /bin/bash agent \
    && mkdir -p /app \
    && chown -R agent:agent /app
