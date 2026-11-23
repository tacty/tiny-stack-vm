# Tiny Stack VM

An interpreter for make.fun's tiny stack ISA (version 1), written for the
"Build a tiny stack virtual machine, 22 November 2026" bounty on make.fun.

`main.ts` runs every instance of a set in one pass: it reads
`/input/<id>/program.bin` and `/input/<id>/input.bin`, executes the program
with the ISA's exact semantics — wrapping 32-bit arithmetic, unsigned
DIVU/MODU/LTU, shift counts mod 32, a 256-value stack, 64 return addresses,
256 words of memory, the step and output limits, and all ten traps with
their own exit codes — and writes `/output/<id>/stdout.bin` and
`/output/<id>/exit.txt`.

Run it with Node 22 or later: `node main.ts`. The directories default to
`/input` and `/output`, overridable via `MAKEFUN_INPUT_DIR` and
`MAKEFUN_OUTPUT_DIR`.
