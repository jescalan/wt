import { WtError } from '../core/errors.js';

const SUPPORTED_SHELLS = ['zsh', 'bash', 'fish'] as const;
type Shell = (typeof SUPPORTED_SHELLS)[number];

const SHELL_SCRIPTS: Record<Shell, string> = {
  zsh: `
wt() {
  local output
  output=$(command wt "$@")
  local exit_code=$?

  if [[ $exit_code -eq 0 && -d "$output" ]]; then
    cd "$output"
  else
    echo "$output"
    return $exit_code
  fi
}
`.trim(),

  bash: `
wt() {
  local output
  output=$(command wt "$@")
  local exit_code=$?

  if [[ $exit_code -eq 0 && -d "$output" ]]; then
    cd "$output"
  else
    echo "$output"
    return $exit_code
  fi
}
`.trim(),

  fish: `
function wt
    set -l output (command wt $argv)
    set -l exit_code $status

    if test $exit_code -eq 0 -a -d "$output"
        cd "$output"
    else
        echo "$output"
        return $exit_code
    end
end
`.trim(),
};

export interface InitOptions {
  shell: string;
}

export function initCommand(options: InitOptions): void {
  const shell = options.shell.toLowerCase();

  if (!SUPPORTED_SHELLS.includes(shell as Shell)) {
    throw new WtError(
      `Unsupported shell: ${shell}\nSupported shells: ${SUPPORTED_SHELLS.join(', ')}`
    );
  }

  // Output the shell script to stdout
  console.log(SHELL_SCRIPTS[shell as Shell]);
}
