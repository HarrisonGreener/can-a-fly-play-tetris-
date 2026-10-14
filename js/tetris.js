// A small, standard falling-block game: 10x20 board, 7-bag randomiser,
// simple wall kicks, classic line scoring. No input handling here — the fly's
// brain (or a human, in "your turn" mode) calls move/rotate/softDrop.

(function () {
  const W = 10, H = 20;
  const SHAPES = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]],
    O: [[1, 0], [2, 0], [1, 1], [2, 1]],
    T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
    J: [[0, 0], [0, 1], [1, 1], [2, 1]],
    L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };
  const SIZE = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];
  const LINE_SCORE = [0, 100, 300, 500, 800];

  function rotateCells(cells, size) {
    return cells.map(([x, y]) => [size - 1 - y, x]);
  }

  class Tetris {
    constructor() {
      this.reset();
    }
    reset() {
      this.board = Array.from({ length: H }, () => Array(W).fill(null));
      this.bag = [];
      this.score = 0;
      this.lines = 0;
      this.pieces = 0;
      this.over = false;
      this.next = this.draw();
      this.spawn();
    }
    draw() {
      if (!this.bag.length) {
        this.bag = Object.keys(SHAPES);
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      return this.bag.pop();
    }
    spawn() {
      const kind = this.next;
      this.next = this.draw();
      this.piece = { kind, cells: SHAPES[kind].map((c) => c.slice()), x: 3, y: 0 };
      this.pieces++;
      if (this.collides(this.piece.cells, this.piece.x, this.piece.y)) this.over = true;
    }
    collides(cells, px, py) {
      for (const [cx, cy] of cells) {
        const x = px + cx, y = py + cy;
        if (x < 0 || x >= W || y >= H) return true;
        if (y >= 0 && this.board[y][x]) return true;
      }
      return false;
    }
    move(dx) {
      if (this.over) return false;
      const p = this.piece;
      if (this.collides(p.cells, p.x + dx, p.y)) return false;
      p.x += dx;
      return true;
    }
    rotate() {
      if (this.over || this.piece.kind === 'O') return false;
      const p = this.piece, r = rotateCells(p.cells, SIZE[p.kind]);
      for (const [kx, ky] of KICKS) {
        if (!this.collides(r, p.x + kx, p.y + ky)) {
          p.cells = r; p.x += kx; p.y += ky;
          return true;
        }
      }
      return false;
    }
    /** Move down one row. Returns number of lines cleared if the piece locked, else -1. */
    softDrop() {
      if (this.over) return -1;
      const p = this.piece;
      if (!this.collides(p.cells, p.x, p.y + 1)) {
        p.y++;
        return -1;
      }
      return this.lock();
    }
    lock() {
      const p = this.piece;
      for (const [cx, cy] of p.cells) {
        const y = p.y + cy;
        if (y < 0) { this.over = true; return 0; }
        this.board[y][p.x + cx] = p.kind;
      }
      let cleared = 0;
      for (let y = H - 1; y >= 0; y--) {
        if (this.board[y].every(Boolean)) {
          this.board.splice(y, 1);
          this.board.unshift(Array(W).fill(null));
          cleared++;
          y++;
        }
      }
      this.lines += cleared;
      this.score += LINE_SCORE[cleared] + 10; // +10 for every piece placed
      this.spawn();
      return cleared;
    }
    /** Cells of the falling piece in board coordinates. */
    pieceCells() {
      const p = this.piece;
      return p.cells.map(([cx, cy]) => [p.x + cx, p.y + cy]);
    }
    /** Height of the stack in each column (0 = empty). */
    heights() {
      const h = Array(W).fill(0);
      for (let x = 0; x < W; x++)
        for (let y = 0; y < H; y++)
          if (this.board[y][x]) { h[x] = H - y; break; }
      return h;
    }
  }

  Tetris.W = W;
  Tetris.H = H;
  window.Tetris = Tetris;
})();
