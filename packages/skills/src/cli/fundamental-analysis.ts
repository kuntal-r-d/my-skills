#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { analyze } from '../fundamental-analysis/analyze.js';

runCli(analyze, parseCliArgs(process.argv));
