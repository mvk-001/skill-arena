FROM harbor-evolver-base:20260716

WORKDIR /app

RUN id -u agent >/dev/null 2>&1 || useradd --create-home --shell /bin/bash agent \
    && mkdir -p /app/input /app/deliverables \
    && chown -R agent:agent /app

COPY swagger.json /app/input/swagger.json

RUN chown agent:agent /app/input/swagger.json
