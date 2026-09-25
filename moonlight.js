#!/usr/bin/env node
/*
 * Moonlight.js Lite 10
 * A small UCI chess engine written from scratch in plain JavaScript.
 * Runs in Node.js (stdin/stdout) or in a browser Web Worker (postMessage).
 */
'use strict';

const ENGINE_NAME = 'Moonlight.js Lite 10';
const ENGINE_AUTHOR = 'Moonlight Team';

// ---------- Pieces & board (0x88) ----------
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 0, BLACK = 8;
const typeOf = p => p & 7;
const colorOf = p => p & 8;

const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const K_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
const B_DIR = [15, 17, -15, -17];
const R_DIR = [1, -1, 16, -16];

// Move encoding: from(7) | to(7)<<7 | promo(3)<<14 | flags<<17
const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;
const mFrom = m => m & 127;
const mTo = m => (m >> 7) & 127;
const mPromo = m => (m >> 14) & 7;
const mFlags = m => m >> 17;
const makeMove = (f, t, promo, flags) => f | (t << 7) | (promo << 14) | (flags << 17);

const sqName = s => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
const sqFromName = n => (n.charCodeAt(0) - 97) + (n.charCodeAt(1) - 49) * 16;

// Castling rights: 1=K 2=Q 4=k 8=q
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[4] = 15 & ~3; CASTLE_MASK[0] = 15 & ~2; CASTLE_MASK[7] = 15 & ~1;
CASTLE_MASK[116] = 15 & ~12; CASTLE_MASK[112] = 15 & ~8; CASTLE_MASK[119] = 15 & ~4;

// ---------- Zobrist (two 32-bit halves) ----------
let seed = 0x9E3779B9;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
const ZP1 = new Int32Array(16 * 128), ZP2 = new Int32Array(16 * 128);
for (let i = 0; i < ZP1.length; i++) { ZP1[i] = rnd(); ZP2[i] = rnd(); }
const ZC1 = new Int32Array(16), ZC2 = new Int32Array(16);
for (let i = 0; i < 16; i++) { ZC1[i] = rnd(); ZC2[i] = rnd(); }
const ZE1 = new Int32Array(8), ZE2 = new Int32Array(8);
for (let i = 0; i < 8; i++) { ZE1[i] = rnd(); ZE2[i] = rnd(); }
const ZS1 = rnd(), ZS2 = rnd();

// ---------- Evaluation tables ----------
const MG_VAL = [0, 82, 337, 365, 477, 1025, 0];
const EG_VAL = [0, 94, 281, 297, 512, 936, 0];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];
// Tables written from White's view, a8..h8 first row.
const PST_MG = [null,
  [ 0,  0,  0,  0,  0,  0,  0,  0,
   50, 50, 50, 50, 50, 50, 50, 50,
   10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0],
  [-50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50],
  [-20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20],
  [ 0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0],
  [-20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20],
  [-30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20]];
const PST_EG = PST_MG.slice();
PST_EG[PAWN] =
  [ 0,  0,  0,  0,  0,  0,  0,  0,
   90, 90, 90, 90, 90, 90, 90, 90,
   50, 50, 50, 50, 50, 50, 50, 50,
   30, 30, 30, 30, 30, 30, 30, 30,
   15, 15, 15, 15, 15, 15, 15, 15,
    5,  5,  5,  5,  5,  5,  5,  5,
    0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0];
PST_EG[KING] =
  [-50,-40,-30,-20,-20,-30,-40,-50,
   -30,-20,-10,  0,  0,-10,-20,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-30,  0,  0,  0,  0,-30,-30,
   -50,-30,-30,-30,-30,-30,-30,-50];
// Precompute [piece][sq] -> score (from that piece's own side)
const MG = [], EG = [];
for (let p = 0; p < 16; p++) { MG.push(new Int16Array(128)); EG.push(new Int16Array(128)); }
for (let t = PAWN; t <= KING; t++) for (let s = 0; s < 128; s++) {
  if (s & 0x88) continue;
  const r = s >> 4, f = s & 7;
  const wi = (7 - r) * 8 + f, bi = r * 8 + f;
  MG[t][s] = MG_VAL[t] + PST_MG[t][wi]; EG[t][s] = EG_VAL[t] + PST_EG[t][wi];
  MG[t | 8][s] = MG_VAL[t] + PST_MG[t][bi]; EG[t | 8][s] = EG_VAL[t] + PST_EG[t][bi];
}


// ---------- Extra evaluation terms ----------
const PF_W = new Int8Array(8), PF_B = new Int8Array(8), MINR_W = new Int8Array(8), MAXR_B = new Int8Array(8);
const ZONE = new Uint8Array(128);
const PASS_MG = [0, 5, 10, 20, 35, 60, 100, 0];
const PASS_EG = [0, 10, 20, 40, 70, 120, 200, 0];
const MOB_CENTER = [0, 0, 4, 6, 6, 12, 0];
const MOB_MG = [0, 0, 4, 5, 2, 1, 0];
const MOB_EG = [0, 0, 4, 5, 4, 2, 0];
const ATT_UNIT = [0, 0, 2, 2, 3, 5, 0];
const SAFETY = new Int16Array(100);
for (let i = 0; i < 100; i++) SAFETY[i] = Math.min(500, Math.floor(i * i * 0.8));
const SEE_VAL = [0, 100, 320, 330, 500, 900, 20000];
const PLIST = new Int32Array(64);
const LAZY_MARGIN = 400;
let LAZY_HIT = false;
const EC_BITS = 18, EC_MASK = (1 << EC_BITS) - 1;
const EC_KEY = new Int32Array(1 << EC_BITS), EC_VAL = new Int16Array(1 << EC_BITS), EC_STYLE = new Uint8Array(1 << EC_BITS), EC_SET = new Uint8Array(1 << EC_BITS);
const SEE_GAIN = new Int32Array(40), SEE_REM = new Int32Array(40), SEE_PC = new Int32Array(40);

// Playing styles. pawnDiscount lowers pawn value in the middlegame so the engine
// trades pawns for activity more readily; kingW scales king-attack scoring.
const STYLES = {
  Normal:     { id: 0, name: 'Normal',     kingW: 1.0, mobW: 1.0,  pawnDiscount: 0,  devBonus: 0,  contempt: 0,  bookGambit: 0.5 },
  Aggressive: { id: 1, name: 'Aggressive', kingW: 1.5, mobW: 1.2,  pawnDiscount: 8,  devBonus: 8,  contempt: 15, bookGambit: 3 },
  Gambit:     { id: 2, name: 'Gambit',     kingW: 1.4, mobW: 1.25, pawnDiscount: 20, devBonus: 15, contempt: 25, bookGambit: 8 },
};

const MATE = 30000, INF = 32000, MAX_PLY = 64;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---------- Position ----------
class Position {
  constructor() {
    this.board = new Uint8Array(128);
    this.undo = new Int32Array(8 * 2048);
    this.sp = 0;
    this.style = STYLES.Normal;
    this.setFen(START_FEN);
  }

  setFen(fen) {
    const [pl, side, cast, ep, hm, fm] = fen.trim().split(/\s+/);
    this.board.fill(0);
    this.king = [0, 0];
    let r = 7, f = 0;
    for (const ch of pl) {
      if (ch === '/') { r--; f = 0; }
      else if (ch >= '1' && ch <= '8') f += +ch;
      else {
        const t = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
        const c = ch === ch.toLowerCase() ? BLACK : WHITE;
        const s = r * 16 + f;
        this.board[s] = t | c;
        if (t === KING) this.king[c >> 3] = s;
        f++;
      }
    }
    this.side = side === 'b' ? BLACK : WHITE;
    this.castle = 0;
    if (cast && cast !== '-') for (const ch of cast) this.castle |= { K: 1, Q: 2, k: 4, q: 8 }[ch] || 0;
    this.ep = ep && ep !== '-' ? sqFromName(ep) : -1;
    this.half = +hm || 0;
    this.full = +fm || 1;
    this.sp = 0;
    this.history = [];
    this.computeHash();
  }

  fen() {
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        const ch = ' pnbrqk'[typeOf(p)];
        out += colorOf(p) ? ch : ch.toUpperCase();
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    let c = '';
    if (this.castle & 1) c += 'K'; if (this.castle & 2) c += 'Q';
    if (this.castle & 4) c += 'k'; if (this.castle & 8) c += 'q';
    return `${out} ${this.side ? 'b' : 'w'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }

  computeHash() {
    let h1 = 0, h2 = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = this.board[s];
      if (p) { h1 ^= ZP1[p * 128 + s]; h2 ^= ZP2[p * 128 + s]; }
    }
    h1 ^= ZC1[this.castle]; h2 ^= ZC2[this.castle];
    if (this.ep >= 0) { h1 ^= ZE1[this.ep & 7]; h2 ^= ZE2[this.ep & 7]; }
    if (this.side) { h1 ^= ZS1; h2 ^= ZS2; }
    this.h1 = h1; this.h2 = h2;
  }

  attacked(sq, by) {
    const b = this.board;
    if (by === WHITE) {
      let s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      let s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
    }
    for (let i = 0; i < 8; i++) {
      let s = sq + N_OFF[i]; if (!(s & 0x88) && b[s] === (KNIGHT | by)) return true;
      s = sq + K_OFF[i]; if (!(s & 0x88) && b[s] === (KING | by)) return true;
    }
    for (let i = 0; i < 4; i++) {
      let d = B_DIR[i], s = sq + d;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (colorOf(p) === by && (typeOf(p) === BISHOP || typeOf(p) === QUEEN)) return true; break; }
        s += d;
      }
      d = R_DIR[i]; s = sq + d;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (colorOf(p) === by && (typeOf(p) === ROOK || typeOf(p) === QUEEN)) return true; break; }
        s += d;
      }
    }
    return false;
  }

  inCheck() { return this.attacked(this.king[this.side >> 3], this.side ^ 8); }

  // Pseudo-legal move generation. capturesOnly also includes queen promotions.
  genMoves(list, capturesOnly) {
    const b = this.board, us = this.side, them = us ^ 8;
    let n = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!p || colorOf(p) !== us) continue;
      const t = typeOf(p);
      if (t === PAWN) {
        const dir = us ? -16 : 16;
        const promoRank = us ? 0 : 7;
        const startRank = us ? 6 : 1;
        const to = s + dir;
        if (!(to & 0x88) && !b[to]) {
          if ((to >> 4) === promoRank) {
            list[n++] = makeMove(s, to, QUEEN, 0);
            if (!capturesOnly) { list[n++] = makeMove(s, to, ROOK, 0); list[n++] = makeMove(s, to, BISHOP, 0); list[n++] = makeMove(s, to, KNIGHT, 0); }
          } else if (!capturesOnly) {
            list[n++] = makeMove(s, to, 0, 0);
            if ((s >> 4) === startRank && !b[to + dir]) list[n++] = makeMove(s, to + dir, 0, F_DOUBLE);
          }
        }
        for (let k = 0; k < 2; k++) {
          const c = s + dir + (k ? 1 : -1);
          if (c & 0x88) continue;
          if (b[c] && colorOf(b[c]) === them) {
            if ((c >> 4) === promoRank) {
              list[n++] = makeMove(s, c, QUEEN, F_CAP);
              if (!capturesOnly) { list[n++] = makeMove(s, c, ROOK, F_CAP); list[n++] = makeMove(s, c, BISHOP, F_CAP); list[n++] = makeMove(s, c, KNIGHT, F_CAP); }
            } else list[n++] = makeMove(s, c, 0, F_CAP);
          } else if (c === this.ep) list[n++] = makeMove(s, c, 0, F_CAP | F_EP);
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? N_OFF : K_OFF;
        for (let i = 0; i < 8; i++) {
          const to = s + offs[i];
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!capturesOnly) list[n++] = makeMove(s, to, 0, 0); }
          else if (colorOf(q) === them) list[n++] = makeMove(s, to, 0, F_CAP);
        }
      } else {
        const dirs = t === BISHOP ? B_DIR : t === ROOK ? R_DIR : K_OFF;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i];
          let to = s + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (!q) { if (!capturesOnly) list[n++] = makeMove(s, to, 0, 0); }
            else { if (colorOf(q) === them) list[n++] = makeMove(s, to, 0, F_CAP); break; }
            to += d;
          }
        }
      }
    }
    if (!capturesOnly) {
      if (us === WHITE) {
        if ((this.castle & 1) && !b[5] && !b[6] && !this.attacked(4, BLACK) && !this.attacked(5, BLACK) && !this.attacked(6, BLACK))
          list[n++] = makeMove(4, 6, 0, F_CASTLE);
        if ((this.castle & 2) && !b[1] && !b[2] && !b[3] && !this.attacked(4, BLACK) && !this.attacked(3, BLACK) && !this.attacked(2, BLACK))
          list[n++] = makeMove(4, 2, 0, F_CASTLE);
      } else {
        if ((this.castle & 4) && !b[117] && !b[118] && !this.attacked(116, WHITE) && !this.attacked(117, WHITE) && !this.attacked(118, WHITE))
          list[n++] = makeMove(116, 118, 0, F_CASTLE);
        if ((this.castle & 8) && !b[113] && !b[114] && !b[115] && !this.attacked(116, WHITE) && !this.attacked(115, WHITE) && !this.attacked(114, WHITE))
          list[n++] = makeMove(116, 114, 0, F_CASTLE);
      }
    }
    return n;
  }

  // Returns false (and undoes) if the move leaves own king in check.
  make(m) {
    const b = this.board, from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const piece = b[from], us = this.side;
    let capSq = to;
    if (fl & F_EP) capSq = us ? to + 16 : to - 16;
    const captured = b[capSq];
    this.pushUndo(m, captured);
    this.history.push(this.h1);

    let h1 = this.h1, h2 = this.h2;
    h1 ^= ZP1[piece * 128 + from]; h2 ^= ZP2[piece * 128 + from];
    if (captured) { h1 ^= ZP1[captured * 128 + capSq]; h2 ^= ZP2[captured * 128 + capSq]; b[capSq] = 0; }
    const placed = promo ? (promo | us) : piece;
    b[from] = 0; b[to] = placed;
    h1 ^= ZP1[placed * 128 + to]; h2 ^= ZP2[placed * 128 + to];

    if (fl & F_CASTLE) {
      let rf, rt;
      if (to === 6) { rf = 7; rt = 5; } else if (to === 2) { rf = 0; rt = 3; }
      else if (to === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
      const rook = b[rf];
      b[rf] = 0; b[rt] = rook;
      h1 ^= ZP1[rook * 128 + rf] ^ ZP1[rook * 128 + rt];
      h2 ^= ZP2[rook * 128 + rf] ^ ZP2[rook * 128 + rt];
    }
    if (typeOf(piece) === KING) this.king[us >> 3] = to;

    if (this.ep >= 0) { h1 ^= ZE1[this.ep & 7]; h2 ^= ZE2[this.ep & 7]; }
    this.ep = (fl & F_DOUBLE) ? (from + to) >> 1 : -1;
    if (this.ep >= 0) { h1 ^= ZE1[this.ep & 7]; h2 ^= ZE2[this.ep & 7]; }

    h1 ^= ZC1[this.castle]; h2 ^= ZC2[this.castle];
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    h1 ^= ZC1[this.castle]; h2 ^= ZC2[this.castle];

    this.half = (captured || typeOf(piece) === PAWN) ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side ^= 8;
    h1 ^= ZS1; h2 ^= ZS2;
    this.h1 = h1; this.h2 = h2;

    if (this.attacked(this.king[us >> 3], this.side)) { this.unmake(); return false; }
    return true;
  }

  pushUndo(m, captured) {
    const u = this.undo, i = this.sp * 8;
    if (i >= u.length) { const bigger = new Int32Array(u.length * 2); bigger.set(u); this.undo = bigger; return this.pushUndo(m, captured); }
    u[i] = m; u[i + 1] = captured; u[i + 2] = this.castle; u[i + 3] = this.ep; u[i + 4] = this.half; u[i + 5] = this.h1; u[i + 6] = this.h2;
    this.sp++;
  }

  unmake() {
    this.sp--;
    const U = this.undo, i = this.sp * 8;
    const u = { m: U[i], captured: U[i + 1], castle: U[i + 2], ep: U[i + 3], half: U[i + 4], h1: U[i + 5], h2: U[i + 6] };
    this.history.pop();
    const b = this.board, m = u.m, from = mFrom(m), to = mTo(m), fl = mFlags(m);
    this.side ^= 8;
    const us = this.side;
    if (us === BLACK) this.full--;
    let piece = b[to];
    if (mPromo(m)) piece = PAWN | us;
    b[from] = piece; b[to] = 0;
    if (u.captured) b[(fl & F_EP) ? (us ? to + 16 : to - 16) : to] = u.captured;
    if (fl & F_CASTLE) {
      let rf, rt;
      if (to === 6) { rf = 7; rt = 5; } else if (to === 2) { rf = 0; rt = 3; }
      else if (to === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
      b[rf] = b[rt]; b[rt] = 0;
    }
    if (typeOf(piece) === KING) this.king[us >> 3] = from;
    this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.h1 = u.h1; this.h2 = u.h2;
  }

  makeNull() {
    this.pushUndo(0, 0);
    this.history.push(this.h1);
    if (this.ep >= 0) { this.h1 ^= ZE1[this.ep & 7]; this.h2 ^= ZE2[this.ep & 7]; }
    this.ep = -1;
    this.side ^= 8; this.h1 ^= ZS1; this.h2 ^= ZS2;
    this.half++;
  }

  unmakeNull() {
    this.sp--;
    const U = this.undo, i = this.sp * 8;
    const u = { ep: U[i + 3], half: U[i + 4], h1: U[i + 5], h2: U[i + 6] };
    this.history.pop();
    this.side ^= 8;
    this.ep = u.ep; this.half = u.half; this.h1 = u.h1; this.h2 = u.h2;
  }

  isRepetition() {
    const h = this.history, n = h.length;
    for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) if (h[i] === this.h1) return true;
    return false;
  }

  hasNonPawn(side) {
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.board[s];
      if (p && colorOf(p) === side && typeOf(p) !== PAWN && typeOf(p) !== KING) return true;
    }
    return false;
  }

  evaluate(alpha = -INF, beta = INF) {
    const ci = this.h1 & EC_MASK;
    if (EC_KEY[ci] === this.h2 && EC_STYLE[ci] === this.style.id && EC_SET[ci]) return EC_VAL[ci];
    LAZY_HIT = false;
    const v = this.evaluateFull(alpha, beta);
    if (!LAZY_HIT) { EC_KEY[ci] = this.h2; EC_VAL[ci] = v; EC_STYLE[ci] = this.style.id; EC_SET[ci] = 1; }
    return v;
  }

  evaluateFull(alpha, beta) {
    const b = this.board, st = this.style;
    let mg = 0, eg = 0, phase = 0, wb = 0, bb = 0;
    // pawn structure maps
    PF_W.fill(0); PF_B.fill(0); MINR_W.fill(8); MAXR_B.fill(-1);
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p === PAWN) { const f = s & 7, r = s >> 4; PF_W[f]++; if (r < MINR_W[f]) MINR_W[f] = r; }
      else if (p === (PAWN | 8)) { const f = s & 7, r = s >> 4; PF_B[f]++; if (r > MAXR_B[f]) MAXR_B[f] = r; }
    }
    // king zones
    ZONE.fill(0);
    const wk = this.king[0], bk = this.king[1];
    for (let i = 0; i < 8; i++) {
      let s = wk + K_OFF[i]; if (!(s & 0x88)) ZONE[s] |= 1;
      s = bk + K_OFF[i]; if (!(s & 0x88)) ZONE[s] |= 2;
    }
    ZONE[wk] |= 1; ZONE[bk] |= 2;
    if (!((wk + 32) & 0x88)) ZONE[wk + 32] |= 1;
    if (!((bk - 32) & 0x88)) ZONE[bk - 32] |= 2;
    let attW = 0, attB = 0, unitsW = 0, unitsB = 0; // attacks ON the white / black king
    let mobMg = 0, mobEg = 0, dev = 0, np = 0;

    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!p) continue;
      const t = typeOf(p), black = colorOf(p) !== 0, sign = black ? -1 : 1;
      phase += PHASE_W[t];
      mg += sign * MG[p][s]; eg += sign * EG[p][s];
      const f = s & 7, r = s >> 4;
      if (t === PAWN) {
        mg -= sign * st.pawnDiscount;
        const own = black ? PF_B : PF_W;
        if (own[f] > 1) { mg -= sign * 6; eg -= sign * 12; }
        if ((f === 0 || !own[f - 1]) && (f === 7 || !own[f + 1])) { mg -= sign * 10; eg -= sign * 14; }
        let passed = true;
        for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
          if (!black && MAXR_B[ff] > r) { passed = false; break; }
          if (black && MINR_W[ff] < r) { passed = false; break; }
        }
        if (passed) { const rr = black ? 7 - r : r; mg += sign * PASS_MG[rr]; eg += sign * PASS_EG[rr]; }
        continue;
      }
      if (t === KING) continue;
      if (t === BISHOP) { if (black) bb++; else wb++; }
      PLIST[np++] = s;
    }
    {
      if (wb >= 2) { mg += 30; eg += 50; }
      if (bb >= 2) { mg -= 30; eg -= 50; }
      const ph = phase > 24 ? 24 : phase;
      const quick = (((mg * ph + eg * (24 - ph)) / 24) | 0) * (this.side ? -1 : 1) + 12;
      if (quick - LAZY_MARGIN >= beta || quick + LAZY_MARGIN <= alpha) { LAZY_HIT = true; return quick; }
    }
    for (let pi = 0; pi < np; pi++) {
      const s = PLIST[pi], p = b[s], t = typeOf(p), black = colorOf(p) !== 0, sign = black ? -1 : 1;
      const f = s & 7, r = s >> 4;
      if (st.devBonus && (t === KNIGHT || t === BISHOP) && r !== (black ? 7 : 0)) dev += sign * st.devBonus;
      // mobility + king attack
      const enemyZoneBit = black ? 1 : 2;
      let mob = 0, hits = 0;
      if (t === KNIGHT) {
        for (let i = 0; i < 8; i++) {
          const to = s + N_OFF[i];
          if (to & 0x88) continue;
          const q = b[to];
          if (!q || (colorOf(q) !== 0) !== black) mob++;
          if (ZONE[to] & enemyZoneBit) hits++;
        }
      } else {
        const dirs = t === BISHOP ? B_DIR : t === ROOK ? R_DIR : K_OFF;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i];
          let to = s + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (ZONE[to] & enemyZoneBit) hits++;
            if (!q) mob++;
            else { if ((colorOf(q) !== 0) !== black) mob++; break; }
            to += d;
          }
        }
        if (t === ROOK) {
          const own = black ? PF_B : PF_W, opp = black ? PF_W : PF_B;
          if (!own[f]) { if (!opp[f]) { mg += sign * 25; eg += sign * 10; } else { mg += sign * 12; eg += sign * 5; } }
        }
      }
      const c = MOB_CENTER[t];
      mobMg += sign * (mob - c) * MOB_MG[t]; mobEg += sign * (mob - c) * MOB_EG[t];
      if (hits) {
        if (black) { attW++; unitsW += hits * ATT_UNIT[t]; }
        else { attB++; unitsB += hits * ATT_UNIT[t]; }
      }
    }
    mg += (mobMg * st.mobW) | 0; eg += (mobEg * st.mobW) | 0;
    mg += dev;
    // king safety: pawn shield + attackers
    mg += this.shield(wk, WHITE) - this.shield(bk, BLACK);
    if (attW >= 2) mg -= (SAFETY[Math.min(unitsW, 99)] * st.kingW) | 0;
    if (attB >= 2) mg += (SAFETY[Math.min(unitsB, 99)] * st.kingW) | 0;
    if (phase > 24) phase = 24;
    const score = ((mg * phase + eg * (24 - phase)) / 24) | 0;
    return (this.side ? -score : score) + 12;
  }

  shield(k, color) {
    const r = k >> 4, f = k & 7, b = this.board;
    if (color === WHITE ? r > 1 : r < 6) return -15;
    const dir = color === WHITE ? 16 : -16, pawn = PAWN | color;
    let bonus = 0;
    for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
      const s1 = r * 16 + ff + dir, s2 = s1 + dir;
      if (!(s1 & 0x88) && b[s1] === pawn) bonus += 14;
      else if (!(s2 & 0x88) && b[s2] === pawn) bonus += 7;
      else bonus -= 10;
    }
    return bonus;
  }

  // Static exchange evaluation of a capture (in centipawns, from the mover's view)
  see(m) {
    const b = this.board, from = mFrom(m), to = mTo(m);
    const gain = SEE_GAIN, removed = SEE_REM;
    let nRem = 0, d = 0;
    gain[0] = (mFlags(m) & F_EP) ? SEE_VAL[PAWN] : SEE_VAL[typeOf(b[to])];
    let attackerVal = SEE_VAL[mPromo(m) || typeOf(b[from])];
    removed[nRem++] = from; SEE_PC[0] = b[from]; b[from] = 0;
    let side = colorOf(SEE_PC[0]) ^ 8;
    while (true) {
      const sq = this.leastAttacker(to, side);
      if (sq < 0) break;
      d++;
      gain[d] = attackerVal - gain[d - 1];
      if (Math.max(-gain[d - 1], gain[d]) < 0) break;
      attackerVal = SEE_VAL[typeOf(b[sq])];
      SEE_PC[nRem] = b[sq]; removed[nRem++] = sq; b[sq] = 0;
      side ^= 8;
    }
    for (let i = 0; i < nRem; i++) b[removed[i]] = SEE_PC[i];
    while (--d > 0) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    return gain[0];
  }

  leastAttacker(sq, by) {
    const b = this.board;
    const p1 = by === WHITE ? sq - 15 : sq + 15, p2 = by === WHITE ? sq - 17 : sq + 17;
    if (!(p1 & 0x88) && b[p1] === (PAWN | by)) return p1;
    if (!(p2 & 0x88) && b[p2] === (PAWN | by)) return p2;
    for (let i = 0; i < 8; i++) { const s = sq + N_OFF[i]; if (!(s & 0x88) && b[s] === (KNIGHT | by)) return s; }
    let rq = -1, qq = -1;
    for (let i = 0; i < 4; i++) {
      let s = sq + B_DIR[i];
      while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === (BISHOP | by)) return s; if (p === (QUEEN | by) && qq < 0) qq = s; break; } s += B_DIR[i]; }
      s = sq + R_DIR[i];
      while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === (ROOK | by) && rq < 0) rq = s; if (p === (QUEEN | by) && qq < 0) qq = s; break; } s += R_DIR[i]; }
    }
    if (rq >= 0) return rq;
    if (qq >= 0) return qq;
    for (let i = 0; i < 8; i++) { const s = sq + K_OFF[i]; if (!(s & 0x88) && b[s] === (KING | by)) return s; }
    return -1;
  }

  moveToUci(m) {
    const p = mPromo(m);
    return sqName(mFrom(m)) + sqName(mTo(m)) + (p ? ' nbrq'[p - 1] : '');
  }

  legalMoves() {
    const list = new Int32Array(256), out = [];
    const n = this.genMoves(list, false);
    for (let i = 0; i < n; i++) if (this.make(list[i])) { this.unmake(); out.push(list[i]); }
    return out;
  }

  parseMove(str) {
    for (const m of this.legalMoves()) if (this.moveToUci(m) === str.toLowerCase()) return m;
    return 0;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const list = new Int32Array(256), n = this.genMoves(list, false);
    let total = 0;
    for (let i = 0; i < n; i++) {
      if (!this.make(list[i])) continue;
      total += this.perft(depth - 1);
      this.unmake();
    }
    return total;
  }

  display() {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let line = (r + 1) + ' ';
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 16 + f];
        const ch = p ? ' pnbrqk'[typeOf(p)] : '.';
        line += ' ' + (p && !colorOf(p) ? ch.toUpperCase() : ch);
      }
      rows.push(line);
    }
    rows.push('   a b c d e f g h', 'Fen: ' + this.fen());
    return rows.join('\n');
  }
}

// ---------- Search ----------
const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

const LMR = [];
for (let d = 0; d < 64; d++) { LMR.push(new Int8Array(64)); for (let m = 0; m < 64; m++) LMR[d][m] = d && m ? Math.floor(0.75 + Math.log(d) * Math.log(m) / 2.25) : 0; }

class Search {
  constructor(pos, send) {
    this.pos = pos;
    this.send = send;
    this.ttKey = new Int32Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int16Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Uint8Array(TT_SIZE);
    this.history = new Int32Array(16 * 128);
    this.killers = new Int32Array(MAX_PLY * 2);
    this.contempt = 0;
    this.quietBuf = [];
    for (let i = 0; i < MAX_PLY + 1; i++) this.quietBuf.push(new Int32Array(256));
    this.moveBuf = [];
    this.scoreBuf = [];
    for (let i = 0; i < MAX_PLY + 1; i++) { this.moveBuf.push(new Int32Array(256)); this.scoreBuf.push(new Int32Array(256)); }
  }

  clear() {
    this.ttKey.fill(0); this.ttMove.fill(0); this.ttFlag.fill(0);
    this.history.fill(0); this.killers.fill(0);
  }

  ttStore(depth, score, flag, move, ply) {
    const i = this.pos.h1 & TT_MASK;
    if (this.ttFlag[i] && this.ttKey[i] === this.pos.h2 && this.ttDepth[i] > depth && flag !== TT_EXACT) return;
    if (score > MATE - MAX_PLY) score += ply; else if (score < -MATE + MAX_PLY) score -= ply;
    this.ttKey[i] = this.pos.h2; this.ttMove[i] = move; this.ttScore[i] = score;
    this.ttDepth[i] = depth; this.ttFlag[i] = flag;
  }

  checkTime() {
    if ((++this.nodes & 2047) === 0 && this.deadline && Date.now() >= this.deadline) this.stopped = true;
    if (this.maxNodes && this.nodes >= this.maxNodes) this.stopped = true;
  }

  orderMoves(list, scores, n, ttMove, ply) {
    const pos = this.pos, b = pos.board;
    for (let i = 0; i < n; i++) {
      const m = list[i];
      if (m === ttMove) scores[i] = 2000000;
      else if (mFlags(m) & F_CAP) {
        const victim = (mFlags(m) & F_EP) ? PAWN : typeOf(b[mTo(m)]);
        const mvv = victim * 100 - typeOf(b[mFrom(m)]);
        const good = SEE_VAL[typeOf(b[mFrom(m)])] <= SEE_VAL[victim] || pos.see(m) >= 0;
        scores[i] = (good ? 1000000 : 500000) + mvv;
      } else if (mPromo(m)) scores[i] = mPromo(m) === QUEEN ? 950000 : -100000;
      else if (m === this.killers[ply * 2]) scores[i] = 800000;
      else if (m === this.killers[ply * 2 + 1]) scores[i] = 790000;
      else scores[i] = this.history[b[mFrom(m)] * 128 + mTo(m)];
    }
  }

  drawScore(ply) { return (ply & 1) ? this.contempt : -this.contempt; }

  pick(list, scores, n, i) {
    let best = i;
    for (let j = i + 1; j < n; j++) if (scores[j] > scores[best]) best = j;
    if (best !== i) {
      const tm = list[i]; list[i] = list[best]; list[best] = tm;
      const ts = scores[i]; scores[i] = scores[best]; scores[best] = ts;
    }
    return list[i];
  }

  qsearch(alpha, beta, ply) {
    this.checkTime();
    if (this.stopped) return 0;
    const pos = this.pos;
    const stand = pos.evaluate(alpha, beta);
    if (ply >= MAX_PLY) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const list = this.moveBuf[ply], scores = this.scoreBuf[ply];
    const n = pos.genMoves(list, true);
    this.orderMoves(list, scores, n, 0, ply);
    for (let i = 0; i < n; i++) {
      const m = this.pick(list, scores, n, i);
      if (!mPromo(m)) {
        const victim = (mFlags(m) & F_EP) ? PAWN : typeOf(pos.board[mTo(m)]);
        if (stand + SEE_VAL[victim] + 200 < alpha) continue;
        if (scores[i] < 1000000) continue; // losing capture by SEE
      }
      if (!pos.make(m)) continue;
      const score = -this.qsearch(-beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stopped) return 0;
      if (score > alpha) { alpha = score; if (score >= beta) return score; }
    }
    return alpha;
  }

  negamax(depth, alpha, beta, ply, allowNull) {
    const pos = this.pos;
    const pvNode = beta - alpha > 1;
    if (ply > 0) {
      if (pos.half >= 100 || pos.isRepetition()) return this.drawScore(ply);
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0 || ply >= MAX_PLY) return this.qsearch(alpha, beta, ply);
    this.checkTime();
    if (this.stopped) return 0;

    const ti = pos.h1 & TT_MASK;
    let ttMove = 0;
    if (this.ttFlag[ti] && this.ttKey[ti] === pos.h2) {
      ttMove = this.ttMove[ti];
      if (ply > 0 && !pvNode && this.ttDepth[ti] >= depth) {
        let s = this.ttScore[ti];
        if (s > MATE - MAX_PLY) s -= ply; else if (s < -MATE + MAX_PLY) s += ply;
        const f = this.ttFlag[ti];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    const staticEval = inCheck ? -INF : pos.evaluate();

    // reverse futility pruning
    if (!pvNode && !inCheck && depth <= 6 && staticEval - 90 * depth >= beta && Math.abs(beta) < MATE - MAX_PLY) return staticEval;

    // null move pruning (adaptive reduction)
    if (allowNull && !pvNode && !inCheck && depth >= 3 && staticEval >= beta && pos.hasNonPawn(pos.side)) {
      const R = 3 + (depth >> 2) + Math.min(3, ((staticEval - beta) / 200) | 0);
      pos.makeNull();
      const score = -this.negamax(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stopped) return 0;
      if (score >= beta) return score >= MATE - MAX_PLY ? beta : score;
    }

    // internal iterative reduction: no hash move at a deep node
    if (!ttMove && depth >= 5) depth--;

    const list = this.moveBuf[ply], scores = this.scoreBuf[ply], quiets = this.quietBuf[ply];
    const n = pos.genMoves(list, false);
    this.orderMoves(list, scores, n, ttMove, ply);

    let best = -INF, bestMove = 0, legal = 0, nQuiet = 0;
    const origAlpha = alpha;
    const canPrune = !pvNode && !inCheck;
    for (let i = 0; i < n; i++) {
      const m = this.pick(list, scores, n, i);
      const isCap = (mFlags(m) & F_CAP) !== 0;
      const quiet = !isCap && !mPromo(m);
      const killer = m === this.killers[ply * 2] || m === this.killers[ply * 2 + 1];
      if (canPrune && legal > 0 && best > -MATE + MAX_PLY) {
        if (quiet && !killer) {
          // late move pruning
          if (depth <= 4 && nQuiet >= 3 + depth * depth * 2) continue;
          // futility pruning
          if (depth <= 3 && staticEval + 100 + 110 * depth <= alpha) continue;
        } else if (isCap && depth <= 4 && scores[i] < 1000000 && pos.see(m) < -80 * depth) continue;
      }
      if (!pos.make(m)) continue;
      legal++;
      if (quiet) quiets[nQuiet++] = m;
      const givesCheck = pos.inCheck();
      let score;
      if (legal === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let r = 0;
        if (depth >= 3 && legal > 2 && quiet && !inCheck && !givesCheck) {
          r = LMR[Math.min(depth, 63)][Math.min(legal, 63)];
          if (pvNode) r--;
          if (killer) r--;
          const h = this.history[pos.board[mTo(m)] * 128 + mTo(m)];
          if (h > 20000) r--; else if (h < -5000) r++;
          r = Math.max(0, Math.min(r, depth - 2));
        }
        score = -this.negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (r && score > alpha) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stopped) return 0;
      if (score > best) {
        best = score; bestMove = m;
        if (ply === 0) this.rootBest = m;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
              const bonus = Math.min(depth * depth, 400);
              for (let q = 0; q < nQuiet; q++) {
                const qm = quiets[q], hi = pos.board[mFrom(qm)] * 128 + mTo(qm);
                this.history[hi] += qm === m ? bonus : -bonus;
                if (this.history[hi] > 60000 || this.history[hi] < -60000) for (let k = 0; k < this.history.length; k++) this.history[k] >>= 1;
              }
            }
            break;
          }
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : this.drawScore(ply);
    const flag = best >= beta ? TT_LOWER : best > origAlpha ? TT_EXACT : TT_UPPER;
    this.ttStore(depth, best, flag, bestMove, ply);
    return best;
  }

  pvLine(first, maxLen) {
    const pos = this.pos, line = [];
    let m = first, made = 0;
    while (m && line.length < maxLen) {
      const legal = pos.legalMoves();
      if (!legal.includes(m)) break;
      line.push(pos.moveToUci(m));
      pos.make(m); made++;
      const i = pos.h1 & TT_MASK;
      m = (this.ttFlag[i] && this.ttKey[i] === pos.h2) ? this.ttMove[i] : 0;
    }
    while (made--) pos.unmake();
    return line;
  }

  go({ depth = 64, movetime = 0, nodes = 0 } = {}) {
    const start = Date.now();
    this.nodes = 0; this.stopped = false; this.maxNodes = nodes;
    this.deadline = movetime ? start + movetime : 0;
    this.killers.fill(0);
    const legal = this.pos.legalMoves();
    if (!legal.length) { this.send('info depth 0 score ' + (this.pos.inCheck() ? 'mate 0' : 'cp 0')); this.send('bestmove (none)'); return null; }
    let best = legal[0], lastScore = 0;
    for (let d = 1; d <= Math.min(depth, MAX_PLY - 1); d++) {
      let score, window = 30;
      let alpha = d >= 5 ? Math.max(-INF, lastScore - window) : -INF;
      let beta = d >= 5 ? Math.min(INF, lastScore + window) : INF;
      while (true) {
        this.rootBest = 0;
        score = this.negamax(d, alpha, beta, 0, true);
        if (this.stopped) break;
        if (score <= alpha) { alpha = Math.max(-INF, alpha - window); window *= 2; }
        else if (score >= beta) { if (this.rootBest) best = this.rootBest; beta = Math.min(INF, beta + window); window *= 2; }
        else break;
        if (window > 800) { alpha = -INF; beta = INF; }
      }
      if (this.stopped && d > 1) break;
      if (this.rootBest) best = this.rootBest;
      lastScore = score;
      const ms = Date.now() - start;
      let sc;
      if (score > MATE - MAX_PLY) sc = 'mate ' + Math.ceil((MATE - score) / 2);
      else if (score < -MATE + MAX_PLY) sc = 'mate -' + Math.ceil((MATE + score) / 2);
      else sc = 'cp ' + score;
      this.send(`info depth ${d} score ${sc} nodes ${this.nodes} nps ${Math.round(this.nodes * 1000 / Math.max(1, ms))} time ${ms} pv ${this.pvLine(best, d).join(' ')}`);
      if (this.stopped) break;
      if (Math.abs(score) > MATE - MAX_PLY && d > 2) break;
      if (this.deadline && Date.now() - start > (this.deadline - start) * 0.55) break;
    }
    const uci = this.pos.moveToUci(best);
    this.send('bestmove ' + uci);
    return { move: uci, score: lastScore };
  }
}


// ---------- Opening book ----------
// Format per line: "G|Name|moves" (G = gambit line) or "N|Name|moves".
const BOOK_LINES = `
G|King's Gambit Accepted|e2e4 e7e5 f2f4 e5f4 g1f3 g7g5 h2h4 g5g4 f3e5
G|Falkbeer Countergambit|e2e4 e7e5 f2f4 d7d5 e4d5 e5e4
G|Evans Gambit|e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4
G|Danish Gambit|e2e4 e7e5 d2d4 e5d4 c2c3 d4c3 f1c4 c3b2 c1b2
G|Smith-Morra Gambit|e2e4 c7c5 d2d4 c5d4 c2c3 d4c3 b1c3 b8c6 g1f3 d7d6 f1c4
G|Scotch Gambit|e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f1c4 f8c5 e1g1
G|Goring Gambit|e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 c2c3 d4c3 b1c3 f8b4 f1c4
G|Vienna Gambit|e2e4 e7e5 b1c3 g8f6 f2f4 d7d5 f4e5 f6e4 g1f3
G|Blackmar-Diemer Gambit|d2d4 d7d5 e2e4 d5e4 b1c3 g8f6 f2f3 e4f3 g1f3
G|Queen's Gambit Accepted|d2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5 e1g1
G|Benko Gambit|d2d4 g8f6 c2c4 c7c5 d4d5 b7b5 c4b5 a7a6 b5a6 c8a6 b1c3 d7d6
G|Budapest Gambit|d2d4 g8f6 c2c4 e7e5 d4e5 f6g4 c1f4 b8c6 g1f3 f8b4 b1d2 d8e7
G|Albin Countergambit|d2d4 d7d5 c2c4 e7e5 d4e5 d5d4 g1f3 b8c6 g2g3
G|Marshall Attack|e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 e8g8 c2c3 d7d5 e4d5 f6d5 f3e5 c6e5 e1e5 c7c6
G|Two Knights Defense|e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 c6a5 c4b5 c7c6 d5c6 b7c6 b5e2 h7h6 g5f3 e5e4 f3e5
N|Ruy Lopez Closed|e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3
N|Ruy Lopez Berlin|e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6 b5c6 d7c6 d4e5 d6f5 d1d8 e8d8
N|Italian Game|e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8
N|Scotch Game|e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5 d8e7 d1e2 f6d5 c2c4
N|Petrov Defense|e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5 f1d3
N|Sicilian Najdorf|e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 c1e3 e7e5 d4b3 c8e6 f2f3
N|Sicilian Dragon|e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6 c1e3 f8g7 f2f3 e8g8 d1d2 b8c6 f1c4
N|Sicilian Sveshnikov|e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5 d4b5 d7d6 c1g5 a7a6 b5a3 b7b5
N|Sicilian Alapin|e2e4 c7c5 c2c3 g8f6 e4e5 f6d5 d2d4 c5d4 g1f3 b8c6 c3d4
N|French Winawer|e2e4 e7e6 d2d4 d7d5 b1c3 f8b4 e4e5 c7c5 a2a3 b4c3 b2c3 g8e7
N|French Advance|e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6 a2a3
N|Caro-Kann Classical|e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6 h2h4 h7h6 g1f3 b8d7 h4h5 g6h7
N|Caro-Kann Advance|e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1e2 c6c5
N|Scandinavian Defense|e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5
N|Pirc Defense|e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8 e1g1
N|Alekhine Defense|e2e4 g8f6 e4e5 f6d5 d2d4 d7d6 g1f3 c8g4 f1e2 e7e6
N|Queen's Gambit Declined|d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 h7h6 g5h4 b7b6
N|Slav Defense|d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5 e2e3 e7e6 f1c4
N|Semi-Slav Meran|d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 e7e6 e2e3 b8d7 f1d3 d5c4 d3c4 b7b5
N|Nimzo-Indian|d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5 g1f3 c7c5 e1g1
N|Queen's Indian|d2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8a6 b2b3 f8b4 c1d2 b4e7
N|King's Indian|d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5 e1g1 b8c6 d4d5 c6e7
N|Grunfeld Defense|d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7 g1f3 c7c5 f1e2
N|Catalan|d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 f8e7 g1f3 e8g8 e1g1 d5c4 d1c2 a7a6
N|London System|d2d4 d7d5 c1f4 g8f6 e2e3 c7c5 c2c3 b8c6 b1d2 e7e6 g1f3 f8d6 f4g3
N|Dutch Leningrad|d2d4 f7f5 g2g3 g8f6 f1g2 g7g6 g1f3 f8g7 e1g1 e8g8 c2c4 d7d6
N|English Symmetrical|c2c4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 g1f3 e7e6 e1g1 g8e7
N|English Reversed Sicilian|c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5 f1g2 d5b6
N|Reti Opening|g1f3 d7d5 c2c4 e7e6 g2g3 g8f6 f1g2 f8e7 e1g1 e8g8 b2b3
N|Modern Benoni|d2d4 g8f6 c2c4 c7c5 d4d5 e7e6 b1c3 e6d5 c4d5 d7d6 e2e4 g7g6 g1f3 f8g7 f1e2 e8g8
`;

class Book {
  constructor() { this.map = new Map(); this.lines = 0; this.errors = []; }
  key(pos) { return pos.h1 + ':' + pos.h2; }
  // Adds one line; returns number of moves added or -1 if a move was illegal.
  addLine(name, moves, gambit) {
    const pos = new Position();
    const list = moves.trim().split(/\s+/);
    for (let i = 0; i < list.length; i++) {
      const m = pos.parseMove(list[i]);
      if (!m) { this.errors.push(`${name}: illegal move ${list[i]} at ply ${i + 1}`); return -1; }
      const k = this.key(pos);
      let e = this.map.get(k);
      if (!e) { e = new Map(); this.map.set(k, e); }
      let x = e.get(list[i]);
      if (!x) { x = { normal: 0, gambit: 0, names: new Set() }; e.set(list[i], x); }
      if (gambit) x.gambit++; else x.normal++;
      x.names.add(name);
      pos.make(m);
    }
    this.lines++;
    return list.length;
  }
  load(text) {
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('|');
      if (parts.length === 3) this.addLine(parts[1], parts[2], parts[0].toUpperCase() === 'G');
      else this.addLine('Custom', parts[parts.length - 1], false);
    }
  }
  probe(pos, gambitWeight) {
    const e = this.map.get(this.key(pos));
    if (!e) return null;
    const cands = [];
    let total = 0;
    for (const [uci, x] of e) {
      const w = x.normal + x.gambit * gambitWeight;
      if (w <= 0) continue;
      cands.push([uci, w, x]); total += w;
    }
    if (!total) return null;
    let r = Math.random() * total;
    for (const [uci, w, x] of cands) { r -= w; if (r <= 0) return { move: uci, names: [...x.names] }; }
    const last = cands[cands.length - 1];
    return { move: last[0], names: [...last[2].names] };
  }
}

// ---------- UCI ----------
class Engine {
  constructor(send) {
    this.send = send || (() => {});
    this.pos = new Position();
    this.search = new Search(this.pos, this.send);
    this.book = new Book();
    this.book.load(BOOK_LINES);
    this.ownBook = true;
    this.contemptSet = null;
    this.setStyle('Normal');
  }

  setStyle(name) {
    const key = Object.keys(STYLES).find(k => k.toLowerCase() === String(name).toLowerCase());
    if (!key) { this.send('info string unknown style ' + name); return; }
    this.style = STYLES[key];
    this.pos.style = this.style;
    this.search.contempt = this.contemptSet !== null ? this.contemptSet : this.style.contempt;
  }

  setOption(tok) {
    const line = tok.join(' ');
    const m = line.match(/^setoption\s+name\s+(.+?)(?:\s+value\s+(.*))?$/i);
    if (!m) return;
    const name = m[1].trim().toLowerCase(), value = (m[2] || '').trim();
    if (name === 'style') this.setStyle(value);
    else if (name === 'ownbook') this.ownBook = value.toLowerCase() === 'true';
    else if (name === 'contempt') { this.contemptSet = +value || 0; this.search.contempt = this.contemptSet; }
    else if (name === 'bookfile') {
      if (!value || value === '<empty>') return;
      try {
        const text = require('fs').readFileSync(value, 'utf8');
        const before = this.book.lines;
        this.book.load(text);
        this.send(`info string loaded ${this.book.lines - before} book lines from ${value}`);
      } catch (err) { this.send('info string cannot read book file: ' + err.message); }
    }
    else this.send('info string unknown option ' + m[1]);
  }

  command(line) {
    const tok = line.trim().split(/\s+/);
    const cmd = tok[0];
    switch (cmd) {
      case 'uci':
        this.send('id name ' + ENGINE_NAME);
        this.send('id author ' + ENGINE_AUTHOR);
        this.send('option name Style type combo default Normal var Normal var Aggressive var Gambit');
        this.send('option name OwnBook type check default true');
        this.send('option name Contempt type spin default 0 min -100 max 100');
        this.send('option name BookFile type string default <empty>');
        this.send('uciok');
        break;
      case 'isready': this.send('readyok'); break;
      case 'setoption': this.setOption(tok); break;
      case 'book': {
        if (tok[1] === 'add') {
          const rest = line.trim().slice(line.indexOf('add') + 3).trim();
          const parts = rest.split('|');
          const n = parts.length === 3 ? this.book.addLine(parts[1], parts[2], parts[0].toUpperCase() === 'G') : this.book.addLine('Custom', rest, false);
          this.send(n > 0 ? 'info string book line added' : 'info string ' + this.book.errors[this.book.errors.length - 1]);
        } else {
          const e = this.book.map.get(this.book.key(this.pos));
          if (!e) this.send('info string no book moves here');
          else for (const [uci, x] of e) this.send(`info string book ${uci} normal ${x.normal} gambit ${x.gambit} (${[...x.names].join(', ')})`);
        }
        break;
      }
      case 'ucinewgame': this.pos.setFen(START_FEN); this.search.clear(); break;
      case 'position': this.position(tok); break;
      case 'go': this.goCmd(tok); break;
      case 'd': this.send(this.pos.display()); break;
      case 'eval': this.send('eval ' + this.pos.evaluate() + ' (side to move)'); break;
      case 'perft': {
        const d = +tok[1] || 1, t = Date.now();
        const n = this.pos.perft(d);
        this.send(`perft ${d} nodes ${n} time ${Date.now() - t}`);
        break;
      }
      case 'stop': case 'quit': case '': break;
      default: this.send('Unknown command: ' + line.trim());
    }
  }

  position(tok) {
    let i = 1;
    if (tok[i] === 'startpos') { this.pos.setFen(START_FEN); i++; }
    else if (tok[i] === 'fen') {
      const f = [];
      i++;
      while (i < tok.length && tok[i] !== 'moves') f.push(tok[i++]);
      this.pos.setFen(f.join(' '));
    }
    if (tok[i] === 'moves') {
      for (i++; i < tok.length; i++) {
        const m = this.pos.parseMove(tok[i]);
        if (!m) { this.send('info string illegal move ' + tok[i]); break; }
        this.pos.make(m);
      }
    }
    // keep repetition history but drop undo info not needed by search
    this.pos.sp = 0;
  }

  goCmd(tok) {
    if (this.ownBook && !tok.includes('perft')) {
      const hit = this.book.probe(this.pos, this.style.bookGambit);
      if (hit) {
        this.send('info string book move ' + hit.move + ' (' + hit.names.join(', ') + ')');
        this.send('bestmove ' + hit.move);
        return { move: hit.move, book: true };
      }
    }
    const o = {};
    for (let i = 1; i < tok.length; i++) {
      const k = tok[i], v = +tok[i + 1];
      if (['wtime', 'btime', 'winc', 'binc', 'movestogo', 'depth', 'movetime', 'nodes'].includes(k)) { o[k] = v; i++; }
      else if (k === 'infinite') o.infinite = true;
      else if (k === 'perft') { this.command('perft ' + tok[i + 1]); return; }
    }
    let movetime = o.movetime || 0;
    if (!movetime && !o.depth && !o.nodes && !o.infinite) {
      const white = this.pos.side === WHITE;
      const time = white ? o.wtime : o.btime, inc = (white ? o.winc : o.binc) || 0;
      if (time !== undefined) {
        const mtg = o.movestogo || 30;
        movetime = Math.max(20, Math.min(time / mtg + inc * 0.8, time / 2) - 30);
      } else movetime = 2000;
    }
    if (o.infinite && !o.depth) o.depth = 64;
    return this.search.go({ depth: o.depth || 64, movetime, nodes: o.nodes || 0 });
  }
}

// ---------- Environment glue ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Engine, Position, ENGINE_NAME, STYLES };
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const engine = new Engine(line => process.stdout.write(line + '\n'));
  const rl = require('readline').createInterface({ input: process.stdin });
  rl.on('line', line => {
    if (line.trim() === 'quit') { rl.close(); process.exit(0); }
    engine.command(line);
  });
} else if (typeof self !== 'undefined' && typeof postMessage === 'function' && typeof window === 'undefined') {
  const engine = new Engine(line => postMessage(line));
  self.onmessage = e => engine.command(String(e.data));
}
