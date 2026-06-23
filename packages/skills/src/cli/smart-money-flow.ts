#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { analyze } from '../smart-money-flow/analyze.js';

runCli(analyze, parseCliArgs(process.argv));
