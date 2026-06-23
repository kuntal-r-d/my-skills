#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { analyze } from '../risk-manager/analyze.js';

runCli(analyze, parseCliArgs(process.argv));
