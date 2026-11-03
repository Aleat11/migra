# Migra

Migraine tracker: log attacks, track barometric pressure, visualize triggers and patterns, export MIDAS / HIT-6 reports.

## Status

Snapshot of the original cloud build as of 2026-11-02, completed locally the same
day: entry point, routing-free tab layout, data store with localStorage, live
pressure via Open-Meteo, attack timer, 5-step log wizard, history, insights
charts, MIDAS/HIT-6 reports with PDF export, and migraine mode.

## Development

You need [bun](https://bun.sh) (or Node.js + npm).

```sh
git clone <this-repository-url>
cd migra
bun install
bun run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
