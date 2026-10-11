# Puzzle Road Trip

An 8x8 portrait-piece photo puzzle. Each solved puzzle drives 100 miles along a route from Seattle to Key West (about 3,527 miles, 36 puzzles).

- Drop a piece on another to swap them.
- Pieces that fit together lock and move as one. Locked sets never split.
- Timer, move counter and progress save in the browser (localStorage).
- Puzzle pictures are generated scenes, or a photo you pick with "Use my own photo".

## Run
Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works as is).

## Test
`node test_logic.js` checks the puzzle rules (shuffle, locking, swaps, cluster moves, solvability).

## Files
- `index.html`: the page, styles and UI code
- `logic.js`: puzzle rules, no DOM
- `test_logic.js`: rule tests

## Next
Swap the generated scenes for live photos (Picsum needs no key; Unsplash needs an API key and credit to the photographer).
