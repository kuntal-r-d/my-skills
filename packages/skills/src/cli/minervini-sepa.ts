#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { screen } from '../minervini-sepa/screen.js';

runCli(screen, parseCliArgs(process.argv));
