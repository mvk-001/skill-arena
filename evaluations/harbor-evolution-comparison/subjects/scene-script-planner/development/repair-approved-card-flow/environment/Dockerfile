FROM harbor-evolver-base:20260716

RUN id -u agent >/dev/null 2>&1 || useradd --create-home --shell /bin/bash agent
RUN mkdir -p /app \
    && chown -R agent:agent /app

WORKDIR /app
COPY --chown=agent:agent project_brief.md /app/project_brief.md
COPY --chown=agent:agent scene_plan.md /app/scene_plan.md
USER agent
