#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { checklist } from '../value-investment-checklist/checklist.js';

runCli(checklist, parseCliArgs(process.argv));
