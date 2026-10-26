# Puzzle Road Trip

An 8x8 portrait-piece photo puzzle. Each solved puzzle drives 100 miles along a route from Seattle to Key West (about 3,527 miles, 36 puzzles).

- Finish Seattle to Key West to unlock ten more trips on the same US map: Route 66, Pacific Coast, Coast to Coast, the Appalachians, the Great Lakes Circuit, the Gulf Coast, Red Rock Country, the Mississippi River Trail, a New England Loop and Texas Hill Country. Pick from the trip menu; each trip keeps its own progress. "Reset all progress" clears everything. 100 stops across all 11 trips.
- Drop a piece on another to swap them.
- Pieces that fit together lock and move as one. Dropping another piece onto a locked set moves it there anyway: the set relocates whole if there's room, or splits apart (each of its pieces to its own nearest open cell) if there isn't.
- Timer, move counter and progress save in the browser (localStorage).
- Every trip has a photo theme (see the table below). Each puzzle on that trip pulls a random photo matching the theme from [Pexels](https://www.pexels.com), with "Photo by <photographer> on Pexels" shown under the board and on the solved screen, linked to the photographer and the photo's Pexels page (required by the [Pexels API guidelines](https://www.pexels.com/api/documentation/#guidelines)).
- To avoid dull puzzles, each new game loads three candidate photos and keeps the one with the most visual detail (it penalizes flat skies and blank water). The caption shows the score as "detail N/10". If the photo host does not allow reading pixels, the photo is used unscored.
- The last 50 photos used on each trip are remembered (in localStorage) and skipped, so photos don't repeat soon.
- If no API key is set, Pexels errors or is unreachable, or no photo loads within about 12 seconds, the puzzle uses a generated scene instead, and a toast says why. The chosen photo is saved with the game, so Resume brings back the same picture without another API call. Resume retries a failed photo reload a couple of times before giving up on it — worth it since, unlike picking a fresh photo, this is the exact one you were already working on, and the network is often just waking back up after you've been away a while.
- Photos are shown as they are (no color or contrast adjustments).
- Installable as a PWA: "Add to Home Screen" (iOS/Android) or the install icon in a desktop browser puts it on your device like an app, and the core page works offline after the first visit.

## Themes
| Trip | Theme |
|---|---|
| Seattle to Key West | 🏛️ Famous buildings and monuments |
| Route 66 | 🛣️ Roadside Americana |
| Pacific Coast | 🌊 Lighthouses and coastal scenery |
| Coast to Coast | 🌉 Bridges and city skylines |
| Appalachians | 🏔️ National parks and mountain scenery |
| Great Lakes Circuit | 🚢 Great Lakes shoreline scenery |
| Gulf Coast | 🏖️ Gulf Coast beaches and bayous |
| Red Rock Country | 🏜️ Desert canyons and red rock formations |
| Mississippi River Trail | 🚤 River scenery and river towns |
| New England Loop | 🍁 Fall foliage and coastal New England |
| Texas Hill Country | 🌻 Texas wildflowers and hill country |

Each theme is a list of Pexels search queries on its trip in the `TRIPS` array in `index.html`
(`theme.queries`); edit them freely. Every puzzle picks one query at random and searches Pexels for
portrait, large photos (40 per page, a random page from 1 to 5, falling back to page 1 when a query has
fewer results). It then takes 3 photos not used recently on that trip, scores them and keeps the best.
Photos are requested at exactly the board's 1280x1600 (Pexels crops them on its side).

## Pexels API key
1. Get a free key at https://www.pexels.com/api/ (sign in, then "Your API key").
2. Paste it into `PEXELS_API_KEY` near the top of `index.html`.

**The key is public.** The site runs on GitHub Pages, so `index.html` (and the key in it) is visible to
anyone in the repo and in the page source. A Pexels key only allows photo searches, but someone could
copy it and use up your rate limit. If that happens, generate a new key on the Pexels site and paste it in.
Without a key, every puzzle uses a generated scene.

Pexels allows 200 requests per hour and 20,000 per month by default. Each search response is cached in
localStorage for 24 hours (trimmed to the fields the game uses), and a new puzzle makes at most two
searches (usually one, or none when cached), so normal play stays far below those limits. If storage
ever fills up, the cache is cleared first so it can't push out your saved game.

## Run
Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is). The install prompt, offline support and Pexels photo fetches need the page served over `http(s)://` (service workers don't run, and some CORS behavior differs, from a `file://` URL).

## Test
- `node test_logic.js` checks the puzzle rules (shuffle, locking, swaps, cluster moves, solvability).
- `node test_pexels.js` (needs `npm install` for its `jsdom` dev dependency) loads the real page into jsdom with a stubbed `fetch`/`Image`/canvas and drives it through clicks: a themed Pexels load (query params, key header, credit), Resume reloading the same photo without an API call, the 24-hour search cache, skipping recently used photos, falling back to a generated scene (no key, API error, no network), and older saves still resuming. No real API key or network needed.
- `npm test` runs both.

## Files
- `index.html`: the page, styles and UI code, the Pexels API key, and the trips with their photo themes
- `logic.js`: puzzle rules, no DOM
- `test_logic.js`, `test_pexels.js`: rule tests and the themed-photo smoke tests
- `package.json`: pins the `jsdom` dev dependency used only by `test_pexels.js` (no build step, no runtime dependencies)
- `manifest.json`: PWA metadata (name, icons, theme color, display mode)
- `sw.js`: service worker that caches the app shell for offline use
- `icons/`: app icons used by the manifest and `apple-touch-icon`
