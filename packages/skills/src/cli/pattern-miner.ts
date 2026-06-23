#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { mine } from '../pattern-miner/mine.js';

runCli(mine, parseCliArgs(process.argv));
