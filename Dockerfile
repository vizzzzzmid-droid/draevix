FROM oven/bun:1.3.14

ARG TARGETARCH
ENV RUNNING_IN_DOCKER=true

USER root

COPY apps/server/build/out/draevix-linux-x64 /tmp/draevix-linux-x64
COPY apps/server/build/out/draevix-linux-arm64 /tmp/draevix-linux-arm64

RUN set -eux; \
    case "$TARGETARCH" in \
      amd64)  cp /tmp/draevix-linux-x64 /draevix ;; \
      arm64)  cp /tmp/draevix-linux-arm64 /draevix ;; \
      *) echo "Unsupported arch: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    chmod +x /draevix; \
    chown bun:bun /draevix; \
    rm -rf /tmp/draevix-linux-*

RUN mkdir -p /home/bun/.config/draevix && \
    chown -R bun:bun /home/bun/.config

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /home/bun

ENTRYPOINT ["/entrypoint.sh"]