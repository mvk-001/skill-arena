FROM harbor-evolver-base:20260716

RUN id -u agent >/dev/null 2>&1 || useradd --create-home --shell /bin/bash agent
RUN mkdir -p /app \
    && chown -R agent:agent /app

WORKDIR /app
COPY --chown=agent:agent brief.md /app/brief.md
COPY --chown=agent:agent source_packet.md /app/source_packet.md
USER agent
