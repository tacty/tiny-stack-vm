// A tiny stack VM for make.fun's tiny stack ISA (version 1), written to the
// reference semantics: wrapping 32-bit arithmetic, unsigned DIVU/MODU/LTU,
// shift counts mod 32, every trap with its own exit code, exact limits.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p, inp) {
  const n = p.length;
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let csp = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let olen = 0;
  let ip = 0;
  let pc = 0;
  let steps = 0;
  const done = (code) => ({ out: out.slice(0, olen), code });
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    // The opcode's immediate length and stack effect, checked in the ISA's
    // order: unknown opcode (5), cut-off immediate (9), underflow (2),
    // overflow (3), then the instruction's own traps.
    let imm = 0, pops = 0, psh = 0;
    if (op <= 0x07) {
      if (op === 0x01) { imm = 1; psh = 1; }
      else if (op === 0x02) { imm = 4; psh = 1; }
      else if (op === 0x03) pops = 1;
      else if (op === 0x04) { pops = 1; psh = 2; }
      else if (op === 0x05) { pops = 2; psh = 2; }
      else if (op === 0x06) { pops = 2; psh = 3; }
      else if (op === 0x07) { pops = 3; psh = 3; }
    } else if (op >= 0x10 && op <= 0x22 && op !== 0x1f) {
      if (op === 0x17 || op === 0x1b) { pops = 1; psh = 1; }
      else { pops = 2; psh = 1; }
    } else if (op >= 0x30 && op <= 0x34) {
      if (op !== 0x34) imm = 2;
      if (op === 0x31 || op === 0x32) pops = 1;
    } else if (op === 0x40) { pops = 1; psh = 1; }
    else if (op === 0x41) pops = 2;
    else if (op === 0x50 || op === 0x51 || op === 0x53) pops = 1;
    else if (op === 0x52) psh = 1;
    else return done(5);
    if (pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return done(2);
    if (sp - pops + psh > 256) return done(3);
    pc = next;
    switch (op) {
      case 0x00:
        return done(0);
      case 0x01:
        D[sp++] = (p[next - 1] << 24) >> 24;
        break;
      case 0x02:
        D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24);
        break;
      case 0x03:
        sp--;
        break;
      case 0x04:
        D[sp] = D[sp - 1];
        sp++;
        break;
      case 0x05: {
        const t = D[sp - 1];
        D[sp - 1] = D[sp - 2];
        D[sp - 2] = t;
        break;
      }
      case 0x06:
        D[sp] = D[sp - 2];
        sp++;
        break;
      case 0x07: {
        const a = D[sp - 3];
        D[sp - 3] = D[sp - 2];
        D[sp - 2] = D[sp - 1];
        D[sp - 1] = a;
        break;
      }
      case 0x17:
        D[sp - 1] = (-D[sp - 1]) | 0;
        break;
      case 0x1b:
        D[sp - 1] = ~D[sp - 1];
        break;
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = op === 0x30;
        if (!take) take = (op === 0x31) === (D[--sp] === 0);
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) return done(7);
        C[csp++] = next;
        pc = p[next - 2] | (p[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return done(8);
        pc = C[--csp];
        break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr > 255) return done(6);
        D[sp - 1] = M[addr];
        break;
      }
      case 0x41: {
        const addr = D[sp - 1];
        if (addr < 0 || addr > 255) return done(6);
        M[addr] = D[sp - 2];
        sp -= 2;
        break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (olen + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) return done(11);
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52:
        D[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 0x53:
        return done(D[--sp] & 255);
      default: {
        // The binary operators 0x10-0x22 (0x17 and 0x1b returned above).
        const b = D[sp - 1];
        const a = D[sp - 2];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) {
          if (b === 0) return done(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 0x14) {
          if (b === 0) return done(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 0x15) {
          if (b === 0) return done(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 0x16) {
          if (b === 0) return done(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        D[sp - 2] = r;
        sp--;
        break;
      }
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  let prog = new Uint8Array(0);
  let inp = new Uint8Array(0);
  try { prog = new Uint8Array(readFileSync(join(I, id, 'program.bin'))); } catch { /* an unreadable program traps 9 */ }
  try { inp = new Uint8Array(readFileSync(join(I, id, 'input.bin'))); } catch { /* no input bytes */ }
  const r = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
