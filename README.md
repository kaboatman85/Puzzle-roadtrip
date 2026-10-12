# Puzzle Road Trip

An 8x8 portrait-piece photo puzzle. Each solved puzzle drives 100 miles along a route from Seattle to Key West (about 3,527 miles, 36 puzzles).

- Finish Seattle to Key West to unlock ten more trips on the same US map: Route 66, Pacific Coast, Coast to Coast, the Appalachians, the Great Lakes Circuit, the Gulf Coast, Red Rock Country, the Mississippi River Trail, a New England Loop and Texas Hill Country. Pick from the trip menu; each trip keeps its own progress. "Reset all progress" clears everything. 100 stops across all 11 trips.
- Drop a piece on another to swap them.
- Pieces that fit together lock and move as one. Locked sets never split.
- Timer, move counter and progress save in the browser (localStorage).
- Every trip has a photo theme (see the table below) — each puzzle on that trip pulls a random photo matching the theme from [Wikimedia Commons](https://commons.wikimedia.org), with the title, photographer and license shown under the board and linked back to the file page (required by those licenses).
- To avoid dull puzzles, each new game loads three candidate photos and keeps the one with the most visual detail (it penalizes flat skies and blank water). The caption shows the score as "detail N/10". If the photo host does not allow reading pixels, the photo is used unscored.
- If Commons is slow or unreachable, the puzzle falls back to a random photo from [Lorem Picsum](https://picsum.photos) (no theme, no API key); if that also fails, it falls back to a generated scene. A toast names whichever fallback was used. The exact photo (or its seed, for Picsum/scene) is saved, so Resume brings back the same picture.
- Photos get a mild contrast and saturation boost on browsers that support canvas filters.
- If no photo loads within about 12 seconds total across the fallback chain, the puzzle uses a generated scene instead.
- "Use my own photo" lets you pick a picture from your device (skips theming; not saved if you close the page).
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

Each theme is a list of Wikimedia Commons categories in `themes.js`. Every puzzle picks 3 candidate
photos — one from each of 3 random categories in that trip's theme — scores them the same "best of 3"
way as the Picsum fallback, and keeps the best. Photos under 1000px on the short side, or too wide to
crop to the 4:5 board, are skipped in favor of the next candidate.

## Run
Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is). The install prompt, offline support and Commons/Picsum photo fetches need the page served over `http(s)://` (service workers don't run, and some CORS behavior differs, from a `file://` URL).

## Test
- `node test_logic.js` checks the puzzle rules (shuffle, locking, swaps, cluster moves, solvability).
- `node test_commons.js` (needs `npm install` for its `jsdom` dev dependency) loads the real page into jsdom with a stubbed `fetch`/`Image`/canvas and drives it through clicks: a themed load, Resume loading the exact same file, Commons failing over to Picsum then to the generated scene, and old picsum/scene saves still resuming.
- `npm test` runs both.
- `node verify-categories.js` checks every category in `themes.js` against the live Commons API (existence + how many usable JPEGs). Run it after editing `themes.js`.

## Files
- `index.html`: the page, styles and UI code
- `logic.js`: puzzle rules, no DOM
- `themes.js`: the Commons category list per trip theme
- `commons.js`: Wikimedia Commons data layer (category listing, image info, seeded candidate selection), no DOM
- `test_logic.js`, `test_commons.js`: rule tests and the themed-photo smoke tests
- `verify-categories.js`: checks `themes.js`'s categories against the live Commons API
- `package.json`: pins the `jsdom` dev dependency used only by `test_commons.js` (no build step, no runtime dependencies)
- `manifest.json`: PWA metadata (name, icons, theme color, display mode)
- `sw.js`: service worker that caches the app shell for offline use
- `icons/`: app icons used by the manifest and `apple-touch-icon`
