import { MockPty } from "@gausszhou/mock-pty";

export class Terminal {
  public identifier: number;

  private pty: MockPty;

  constructor(identifier: number) {
    this.identifier = identifier;
    this.pty = new MockPty("bash", [], { cwd: "/root" });
    this.pty.onData(this.onData.bind(this));
  }
  
  init() {
    this.pty = new MockPty("bash", [], { cwd: "/root" });
    this.pty.onData(this.onData.bind(this));
  }

  refresh() {
    this.pty = new MockPty("bash", [], { cwd: "/root" });
    this.pty.onData(this.onData.bind(this));
  }

  write(data: string) {
    this.pty.write(data);
  }

  kill() {
    this.pty.kill();
  }

  onData(data:string): void {
    // TODO Override
  }
}
