#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { screen } from '../dow-theory/screen.js';

runCli(screen, parseCliArgs(process.argv));
