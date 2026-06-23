#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { screen } from '../momentum-screen/screen.js';

runCli(screen, parseCliArgs(process.argv));
