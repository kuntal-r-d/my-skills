#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { screen } from '../can-slim/screen.js';

runCli(screen, parseCliArgs(process.argv));
