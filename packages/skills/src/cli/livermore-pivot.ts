#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { screen } from '../livermore-pivot/screen.js';

runCli(screen, parseCliArgs(process.argv));
