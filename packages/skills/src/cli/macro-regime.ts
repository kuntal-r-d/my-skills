#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { assess } from '../macro-regime/regime.js';

runCli(assess, parseCliArgs(process.argv));
