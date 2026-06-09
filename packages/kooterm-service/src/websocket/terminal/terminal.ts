import { spawn, IPty } from 'node-pty';

const shell = (): string => {
  if (process.env.SHELL) return process.env.SHELL;
  if (process.platform === 'win32') return 'powershell.exe';
  return 'bash';
};

const defaultCwd = (): string => {
  if (process.env.HOME) return process.env.HOME;
  if (process.env.USERPROFILE) return process.env.USERPROFILE;
  return '/root';
};

export class Terminal {
  public identifier: number;
  private pty: IPty;

  constructor(identifier: number) {
    this.identifier = identifier;
    this.pty = this.createPty();
    this.pty.onData(this.onData.bind(this));
  }

  private createPty(): IPty {
    return spawn(shell(), [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: defaultCwd(),
      env: process.env as { [key: string]: string },
    });
  }

  init() {
    if (this.pty) this.pty.kill();
    this.pty = this.createPty();
    this.pty.onData(this.onData.bind(this));
  }

  refresh() {
    this.init();
  }

  write(data: string) {
    this.pty.write(data);
  }

  kill() {
    if (this.pty) this.pty.kill();
  }

  onData(data: string): void {
    // TODO Override
  }
}
