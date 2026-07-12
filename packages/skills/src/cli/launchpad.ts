#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { screen } from '../launchpad/screen.js';

runCli(screen, parseCliArgs(process.argv));
