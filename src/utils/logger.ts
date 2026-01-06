const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
} as const;

function colorize(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

export interface Logger {
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export function createLogger(verbose = false): Logger {
  return {
    info(message: string) {
      console.error(colorize('blue', 'info') + ' ' + message);
    },
    success(message: string) {
      console.error(colorize('green', 'success') + ' ' + message);
    },
    warn(message: string) {
      console.error(colorize('yellow', 'warn') + ' ' + message);
    },
    error(message: string) {
      console.error(colorize('red', 'error') + ' ' + message);
    },
    debug(message: string) {
      if (verbose) {
        console.error(colorize('gray', 'debug') + ' ' + message);
      }
    },
  };
}

export const logger = createLogger();
