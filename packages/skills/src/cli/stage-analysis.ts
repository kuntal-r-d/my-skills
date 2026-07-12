#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { screen } from '../stage-analysis/screen.js';

runCli(screen, parseCliArgs(process.argv));
