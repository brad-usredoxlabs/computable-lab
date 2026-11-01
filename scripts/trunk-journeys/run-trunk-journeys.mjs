#!/usr/bin/env node
// trunk-journeys driver entry (thin shim). Delegates to the TS driver via tsx.
// `node run-trunk-journeys.mjs --help` prints help; other flags run the driver.
import { runTs, HERE } from './cli.mjs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const code = runTs(join(HERE, 'run-trunk-journeys.ts'), argv);
process.exit(code);
