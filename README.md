<div align="center">
  <h1>Draevix</h1>
  <p><strong>A lightweight, self-hosted real-time communication platform</strong></p>
</div>

> [!NOTE]
> Draevix is in alpha stage. Bugs, incomplete features and breaking changes are to be expected.

Draevix brings the most important Discord-like features to your own infrastructure: voice, video and screen sharing without the bloat or surveillance.

## Features

- **Voice channels** with video and screen sharing, over a built-in mediasoup SFU — including system-audio capture in the desktop app
- **Listening parties**: shared music queue (SoundCloud, Audius) with repeat, shuffle and synchronized playback
- **Watch parties** with synchronized video playback
- **Text channels** grouped into categories, with threads, replies, reactions, pins and search
- **Direct messages** between members
- **Roles and permissions**, with per-channel overrides for individual roles and users
- **Custom emoji**, mentions and channel references
- **Invites** with usage limits and automatic role assignment
- **File uploads** with per-user storage quotas, image optimization and optional signed URLs
- **Plugins** that extend both server and client, through the [plugin SDK](packages/plugin-sdk)
- **Desktop app** (Tauri, Windows and Linux) with auto-update and a community server picker
- **8 interface languages**, OIDC login, notification settings

## Project structure

```
apps/
  server/    Bun + tRPC + Drizzle (SQLite) backend, mediasoup SFU
  client/    React 19 + Tailwind CSS web frontend (Vite)
  desktop/   Tauri v2 wrapper around the web frontend
packages/
  shared/    Shared types, tRPC router contracts, static constants
  ui/        Shared Radix/ShadCN UI primitives
  plugin-sdk/ SDK for writing server and client plugins
  e2e/       Playwright end-to-end tests (with an example plugin fixture)
  scripts/   Repo tooling (e.g. i18n key sync report)
```

## Getting started

Requirements: [Bun](https://bun.sh/) 1.3.14+. For the desktop build you also need the [Rust toolchain](https://rustup.rs/).

```bash
git clone https://github.com/vizzzzzmid-droid/draevix.git
cd draevix
bun install
```

Start the app:

- With tmux: `./start.sh`
- Without tmux: run `bun dev` in both `apps/client` and `apps/server`

Then open [http://localhost:4991](http://localhost:4991) in your browser.

> [!WARNING]
> Upon first launch, Draevix creates a secret token and prints it to the console. It is the credential that grants owner access and the key the server signs every session and file URL with, so anyone who obtains it can take ownership **and** impersonate any account. Keep it out of logs, screenshots and issue reports, store it securely, and do not lose it.

Development data (database, uploads) lives in `apps/server/data`. Delete that folder for a clean reset. To start from a server that looks used rather than empty, stop the dev server and run `bun run seed:mock` in `apps/server` (logs in as `admin` with `password123`).

### Docker

```bash
docker run \
  -p 4991:4991/tcp \
  -p 40000:40000/tcp \
  -p 40000:40000/udp \
  -v ./data:/home/bun/.config/draevix \
  --name draevix \
  draevix/draevix:latest
```

### Desktop app

Installers for Windows and Linux are built by the `desktop` GitHub workflow from `desktop-v*` tags. To build locally, install the Rust toolchain and run `bun --filter @draevix/desktop build` from the repo root.

### Community servers

The desktop app shows a server picker fed by [servers.json](servers.json) in this repository. Anyone can add a server with a pull request, there is no moderation. Entries that fail validation are skipped, and servers that do not answer keep their registry name without live details:

```json
[
  {
    "name": "My community",
    "address": "voice.example.com",
    "description": "Optional short description"
  }
]
```

## Scripts

| Command | What it does |
|---|---|
| `bun run format` | Prettier-write everything |
| `bun run check-types` | TypeScript check across workspaces |
| `bun run lint` | ESLint across workspaces |
| `bun run magic` | `format` + `check-types` + `lint` |
| `bun run test` | All unit tests |
| `bun run knip` | Dead code / dependency audit (must be clean) |
| `bun run test:e2e` | Playwright end-to-end suite |

See [DEVELOPMENT.md](DEVELOPMENT.md) for the development setup in detail.

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first — PRs target the `development` branch and follow the title convention described there.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with amazing open-source technologies:

- [Bun](https://bun.sh)
- [tRPC](https://trpc.io)
- [Mediasoup](https://mediasoup.org)
- [Drizzle ORM](https://orm.drizzle.team)
- [React](https://react.dev)
- [Radix UI](https://www.radix-ui.com)
- [Tailwind CSS](https://tailwindcss.com)
