#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { run } from '../financial-terms-educator/lookup.js';

runCli(run, parseCliArgs(process.argv));
