# Puzzle Road Trip

An 8x8 portrait-piece photo puzzle. Each solved puzzle drives 100 miles along a route from Seattle to Key West (about 3,527 miles, 36 puzzles).

- Drop a piece on another to swap them.
- Pieces that fit together lock and move as one. Locked sets never split.
- Timer, move counter and progress save in the browser (localStorage).
- Each new puzzle loads a random photo from [Lorem Picsum](https://picsum.photos) (no API key). The photo seed is saved, so Resume brings back the same picture.
- To avoid dull puzzles, each new game loads three photos and keeps the one with the most visual detail (it penalizes flat skies and blank water). The caption shows the score as "detail N/10". If the photo host does not allow reading pixels, the photo is used unscored.
- Photos get a mild contrast and saturation boost on browsers that support canvas filters.
- If a photo cannot load within 12 seconds, the puzzle uses a generated scene instead.
- "Use my own photo" lets you pick a picture from your device (not saved if you close the page).

## Run
Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is).

## Test
`node test_logic.js` checks the puzzle rules (shuffle, locking, swaps, cluster moves, solvability).

## Files
- `index.html`: the page, styles and UI code
- `logic.js`: puzzle rules, no DOM
- `test_logic.js`: rule tests

## Next
Optional: Unsplash for themed photos (needs an API key and credit to the photographer).
