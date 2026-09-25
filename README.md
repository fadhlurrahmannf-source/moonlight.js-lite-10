# Moonlight.js Lite 10

A UCI chess engine written from scratch in plain JavaScript. One file, no dependencies. Runs in Node.js from the terminal or in the browser as a Web Worker, with the same interface style as stockfish.js.

Moonlight is not a Stockfish port and shares no code with it. It is much weaker than Stockfish; its focus is being small, readable, and having its own playing personality.

## Features

**Search.** PVS alpha-beta with iterative deepening and aspiration windows, transposition table, quiescence search with SEE and delta pruning, check extension, adaptive null-move pruning, late move reductions (logarithmic table), late move pruning, futility and reverse futility pruning, internal iterative reduction. Move ordering by hash move, SEE-classified captures (MVV-LVA), killer moves, and history with maluses.

**Evaluation.** Tapered middlegame/endgame piece-square tables, mobility, king safety (pawn shield plus attack units on the king zone), pawn structure (doubled, isolated, passed pawns scaled by rank), rooks on open and semi-open files, bishop pair, and an evaluation cache.

**Opening book.** 45 built-in lines (381 positions), including 15 gambits: King's Gambit, Falkbeer, Evans, Danish, Smith-Morra, Scotch Gambit, Göring, Vienna Gambit, Blackmar-Diemer, Queen's Gambit Accepted, Benko, Budapest, Albin, Marshall Attack, and Two Knights. You can add your own lines at runtime or from a file.

**Playing styles.** `Normal`, `Aggressive`, and `Gambit`. Gambit style lowers the middlegame value of pawns, raises the value of development, mobility and king attacks, avoids draws, and strongly prefers gambit lines from the book. Outside the book it will offer pawn sacrifices of its own for activity.

## Measured strength

Self-play at 60 ms per move from 25 book openings, playing both colors:

| Match | Games | Result | Score | Elo difference (95% range) |
|---|---|---|---|---|
| Lite 10.1 vs Lite 10.0 | 50 | +28 =8 −14 | 64% | about +100 (roughly +15 to +190) |
| Gambit style vs Normal style | 24 | +5 =6 −13 | 33% | about −120 (−270 to −5) |

These are small samples at very fast time controls, so treat the numbers as rough. No rating against other engines has been measured yet. To get one, play Moonlight against engines with a known rating (for example in Cute Chess) and publish those results.

Gambit style is weaker on purpose: sacrificing material is usually objectively worse. Choose it for entertaining games, not for maximum strength.

## Usage

### Node.js (terminal)

```bash
node moonlight.js
```

```
uci
setoption name Style value Gambit
position startpos moves e2e4 e7e5
go movetime 1000
```

To use it in a UCI GUI (Arena, Cute Chess, BanksiaGUI), point the GUI at a small wrapper script that runs `node /path/to/moonlight.js`.

### Browser (Web Worker)

```js
const engine = new Worker('moonlight.js');
engine.onmessage = e => {
  if (e.data.startsWith('bestmove')) console.log('Moonlight plays', e.data.split(' ')[1]);
};
engine.postMessage('uci');
engine.postMessage('setoption name Style value Aggressive');
engine.postMessage('position startpos moves e2e4');
engine.postMessage('go movetime 1000');
```

### As a module

```js
const { Engine } = require('./moonlight.js');
const engine = new Engine(line => console.log(line));
engine.command('position startpos');
engine.command('go depth 10');
```

## Play in the browser (index.html)

`index.html` is a full chess page built on the engine:

- Play against Moonlight in any style, or against Stockfish 10 at levels 0 to 20, or a random mover.
- Set any two players against each other, for example Moonlight (Gambit) vs Stockfish (Level 5), and watch.
- Live evaluation bar and the top two engine lines for any position you click.
- Game review in the style of chess.com: every move is graded Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, or Blunder, with accuracy for each player, an evaluation graph, and an arrow showing the better move.
- Pieces slide on every move (including the rook when castling, and backwards when you step back through a game). Animation is turned off automatically for people who set their system to reduce motion.
- Sounds for moves, captures, castling, checks, promotions, illegal moves, a new game, and the end of a game (win, loss, or draw). They are synthesized in the browser with the Web Audio API, so there are no audio files. The Sound button turns them off, and the choice is remembered.
- Undo, flip board, pause engine games, copy the game as PGN, and navigate moves with the arrow keys.

`index.html` is a single self-contained file: it carries its own copy of the engine, so you can open it by double-clicking, serve it with any web server, or publish it with GitHub Pages. After changing `moonlight.js`, run `npm run build` to copy the new engine into `index.html`.

An internet connection is needed for two things: Stockfish (for the Stockfish opponents and all analysis) and the piece images. Without internet, Moonlight still plays and the pieces fall back to text symbols.

**About the pieces.** The board uses the Cburnett chess pieces by Colin M.L. Burnett, hotlinked from Wikimedia Commons under CC BY-SA 3.0. The credit is shown at the bottom of the page; keep it if you change the design.

**About Stockfish.** Stockfish is GPL-licensed, so it is not included in this repository. The page loads Stockfish.js 10 (asm.js build) from the jsDelivr CDN at runtime. To use a local copy instead (for example offline), download `stockfish.asm.js` from the `stockfish@10.0.2` npm package into this folder and open `index.html?sf=stockfish.asm.js`.

**About the grades.** The grading follows chess.com's categories but is Moonlight's own approximation, not chess.com's formula. Each move is scored by how much it lowers the mover's winning chances according to Stockfish 10, and accuracy uses the published Lichess accuracy curve. Shallow review depths are noisy (especially in the opening), so use depth 16 or more for games that matter. Stockfish 10 is also much older and weaker than current Stockfish, so its judgement is good but not perfect.

## UCI options

| Option | Values | Default | What it does |
|---|---|---|---|
| `Style` | `Normal`, `Aggressive`, `Gambit` | `Normal` | Playing personality (see above) |
| `OwnBook` | `true` / `false` | `true` | Use the opening book |
| `Contempt` | −100 to 100 | per style | Centipawns the engine gives up to avoid a draw. Normal 0, Aggressive 15, Gambit 25 |
| `BookFile` | path | none | Node.js only. Adds book lines from a text file |

## Book format

One line per opening: `G|Name|moves` for a gambit line, `N|Name|moves` for a normal line. Moves are in UCI notation from the starting position. Lines starting with `#` are comments.

```
G|Latvian Gambit|e2e4 e7e5 g1f3 f7f5
N|Four Knights|e2e4 e7e5 g1f3 b8c6 b1c3 g8f6
```

Load a file with `setoption name BookFile value mybook.txt`, or add one line directly with `book add G|Latvian Gambit|e2e4 e7e5 g1f3 f7f5`. Illegal lines are rejected with the move and ply that failed.

## Extra commands

| Command | What it does |
|---|---|
| `d` | Print the board and current FEN |
| `eval` | Static evaluation for the side to move |
| `book` | List book moves for the current position |
| `book add ...` | Add a book line (see above) |
| `perft N` | Count leaf nodes at depth N |

## Tests and tools

```bash
npm test
```

Runs perft on five standard positions, checks that the evaluation gives the same score for mirrored positions in every style, and checks that every book line is legal.

```bash
node tools/match.js moonlight.js other-version.js 60 Normal Normal
```

Plays a self-play match between two versions and reports the score with an Elo estimate. The environment variables `NSTART` and `NOPEN` select which book openings to use.

## Known limitations

- `stop` is not honored during a search: the search runs synchronously and ends at its time, depth, or node limit. Always give `go` a limit.
- No Polyglot `.bin` book support yet. It requires the official Polyglot random key table, which should be copied from the Polyglot source rather than retyped.
- No endgame tablebases, no multi-threading, no NNUE.
- The Web Worker path is written but has only been tested in Node.js.

## License

MIT. See [LICENSE](LICENSE).
