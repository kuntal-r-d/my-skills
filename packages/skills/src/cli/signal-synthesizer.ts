#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { synthesize } from '../signal-synthesizer/synthesize.js';

runCli(synthesize, parseCliArgs(process.argv));
