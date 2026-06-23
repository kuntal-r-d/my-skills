#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { build } from '../daily-briefing/brief.js';

runCli(build, parseCliArgs(process.argv));
