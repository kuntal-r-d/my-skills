#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { render } from '../ticker-dossier/dossier.js';

runCli(render, parseCliArgs(process.argv));
