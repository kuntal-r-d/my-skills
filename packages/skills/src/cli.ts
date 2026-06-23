import { readFileSync } from 'node:fs';
import { stdin } from 'node:process';

export interface CliOptions {
  input?: string;
  pretty?: boolean;
}

export function readInput(inputPath?: string): string {
  if (inputPath) {
    return readFileSync(inputPath, 'utf8');
  }
  return readFileSync(stdin.fd, 'utf8');
}

export function writeOutput(result: unknown, pretty = false): void {
  const indent = pretty ? 2 : undefined;
  process.stdout.write(`${JSON.stringify(result, null, indent)}\n`);
}

export function runCli(
  handler: (data: Record<string, unknown>) => Record<string, unknown>,
  options: CliOptions = {},
): void {
  let raw: string;
  try {
    raw = readInput(options.input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeOutput({ error: `bad input: ${msg}` });
    process.exit(1);
    return;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeOutput({ error: `bad input: ${msg}` });
    process.exit(1);
    return;
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    writeOutput({ error: 'request must be a JSON object' });
    process.exit(1);
    return;
  }

  const result = handler(data as Record<string, unknown>);
  writeOutput(result, options.pretty);
  if ('error' in result) {
    process.exit(1);
  }
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '--input' && argv[i + 1]) {
      options.input = argv[++i];
    }
  }
  return options;
}
