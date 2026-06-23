#!/usr/bin/env node
import { parseCliArgs, runCli } from '../cli.js';
import { analyze } from '../sentiment-news/sentiment.js';

runCli(analyze, parseCliArgs(process.argv));
