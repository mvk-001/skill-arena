FROM harbor-evolver-base:20260716

RUN id -u agent >/dev/null 2>&1 || useradd --create-home --shell /bin/bash agent
RUN mkdir -p /app /app/images /opt/benchmark/bin \
    && chown -R agent:agent /app

WORKDIR /app
COPY --chown=agent:agent fixtures/ /app/images/
COPY --chown=root:root benchmark/frozen_detector.py /opt/benchmark/bin/frozen-detector
RUN chmod 0555 /opt/benchmark /opt/benchmark/bin /opt/benchmark/bin/frozen-detector
USER agent
