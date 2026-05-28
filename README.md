# Cinema Atlas

An interactive atlas where cinema and personal memory overlap — pin the places you've been, link them to the films that shaped how you see those cities, and explore where reel life meets real life.

---

## What It Does

Cinema Atlas is built around a simple observation: some places we visit twice — once on screen, once in person. The app lets you archive your real travel memories on a world map, search for films through TMDB, and discover where your personal geography overlaps with cinematic geography.

When a film location and a personal memory share the same city — or when you manually link them — the map generates an **overlap marker**. Clicking it opens a split-view where your photo sits beside the film still, connected by a blend slider that lets you dissolve between reality and cinema.

## Features

**Memory Archive** — Pin locations on the map, upload photos, write diary entries, tag emotional notes, and attach ambient music links. Each memory is stored as a collectible object (postcard, polaroid, train ticket, etc.) and appears on a vertical timeline sorted by date.

**Cinema Atlas** — Search any film title via the TMDB API with live suggestions, posters, and metadata. Selecting a film reveals its cinematic coordinates on the map — either from curated location data or inferred from production countries.

**Film–Memory Linking** — After selecting a film, a linking panel shows all your archived memories. Tap any memory to associate it with the current film. Linked memories appear as a photo gallery inside the film detail modal, and generate overlap markers on the map.

**Overlap View** — When reality and cinema share a coordinate, a special marker pulses on the map. Clicking it opens a dual-layer modal with a draggable blend slider — your photo on one side, the film backdrop on the other.

**Cinematic Intro** — A typographic opening sequence fades in the line *"Some places we visit twice: once in films, once in real life"* before revealing the main interface.

## Tech Stack

- **Vanilla JS** — No framework, Vite as dev server and build tool
- **Mapbox GL JS** — Interactive world map with geocoding, custom markers, and fly-to animations
- **TMDB API** — Film search, metadata, posters, and backdrops
- **LocalStorage** — Client-side persistence for memories and film–memory links
- **CSS** — Custom design system with Cormorant Garamond + IBM Plex Sans, film-grain overlay, and editorial layout

## Getting Started

1. Clone the repo:
   ```bash
   git clone https://github.com/KiraZhang-Keqi/FS-CinemaAtlas.git
   cd FS-CinemaAtlas
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file from the template:
   ```bash
   cp .env.example .env
   ```

4. Open `.env` and fill in your API keys:
   ```
   VITE_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
   VITE_TMDB_V3_API_KEY=your_tmdb_api_key_here
   VITE_TMDB_READ_ACCESS_TOKEN=
   ```

5. Start the dev server:
   ```bash
   npm run dev
   ```

6. Open `http://localhost:5173` in your browser.

## Project Structure

```
├── index.html        # Main page with map, panels, and modals
├── script.js         # All application logic — map, TMDB, memory CRUD, linking
├── style.css         # Full design system — layout, typography, markers, animations
├── package.json      # Vite dev dependency and scripts
├── .env.example      # Template for API keys (safe to commit)
├── .env              # Your actual API keys (git-ignored, never committed)
├── .gitignore        # Ignores node_modules, dist, and .env
└── README.md
```

## API Keys

| Service | Purpose | Get one at |
|---------|---------|------------|
| Mapbox | Map rendering and geocoding | [mapbox.com](https://www.mapbox.com/) |
| TMDB | Film search and metadata | [themoviedb.org](https://www.themoviedb.org/settings/api) |

Both offer generous free tiers.

## Roadmap

- [ ] Backend + database for persistent cross-device storage
- [ ] User authentication
- [ ] Shareable memory/film pages with public URLs
- [ ] More curated film location data
- [ ] Mobile-optimized layout
- [ ] Export memories as a printable travel zine

## License

MIT
