#!/usr/bin/env bash
set -euo pipefail

source=/home/draevix-deploy/draevix-linux-x64
target=/opt/draevix/apps/server/build/out/draevix-linux-x64
temporary="${target}.new"
backup="${target}.previous"
had_previous=0

test -s "$source"
test ! -L "$source"
trap 'rm -f "$temporary"' EXIT

install -o root -g root -m 0755 "$source" "$temporary"

if test -f "$target"; then
  cp -p "$target" "$backup"
  had_previous=1
fi

mv -f "$temporary" "$target"

if systemctl restart draevix; then
  for attempt in $(seq 1 30); do
    if curl --fail --silent --max-time 2 http://127.0.0.1:4991/healthz >/dev/null; then
      rm -f "$backup" "$source"
      exit 0
    fi

    sleep 1
  done
fi

if test "$had_previous" -eq 1; then
  mv -f "$backup" "$target"
  systemctl restart draevix
fi

exit 1
