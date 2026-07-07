# pancake-breakfasts

A zero-framework terminal for querying Calgary Stampede pancake breakfasts.

Live at: https://robin-marv.github.io/pancake-breakfasts/

## About

Browse, search, and filter stampede breakfasts by date, area, and status. Keyboard-first with a terminal aesthetic. No framework, no tracking.

## Development

Events data is fetched at runtime from `/all-events.json`. For local development, place an `all-events.json` file in the project root and serve with any static file server:

```bash
npx serve .
```

## Deployment

Deployed automatically to GitHub Pages via GitHub Actions on every push to `main`. The events data is fetched from a private source during the build and is not stored in this repository.
