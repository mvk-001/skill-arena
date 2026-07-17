FROM harbor-evolver-base:20260716

WORKDIR /app

RUN id -u agent >/dev/null 2>&1 || useradd --create-home --shell /bin/bash agent \
    && mkdir -p /app/input /app/artifacts \
    && chown -R agent:agent /app

COPY openapi.json /app/input/openapi.json

RUN chown agent:agent /app/input/openapi.json
