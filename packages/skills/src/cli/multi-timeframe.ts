#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { analyze } from '../multi-timeframe/analyze.js';

runCli(analyze, parseCliArgs(process.argv));
