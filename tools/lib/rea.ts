/**
 * Minimal MCP stdio client for REA (https://github.com/morluto/rea).
 *
 * REA is started as its own MCP server (`rea --mcp`) so its tools can be used
 * from scripts without registering it in an editor. Set REA_BIN to the path of
 * REA's `scripts/rea.mjs` to skip npx; otherwise the pinned npm release runs.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const REA_VERSION = "6.8.0";

interface RpcMessage {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolResult {
  isError: boolean;
  /** Parsed structured content (Evidence or error envelope). */
  data: Record<string, unknown>;
}

export class ReaClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, (msg: RpcMessage) => void>();

  async start(): Promise<void> {
    const bin = process.env.REA_BIN;
    this.child = bin
      ? spawn(process.execPath, [bin, "--mcp"], { stdio: "pipe" })
      : spawn(`npx --yes rea-agents@${REA_VERSION} --mcp`, { stdio: "pipe", shell: true });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      if (process.env.REA_DEBUG) process.stderr.write(chunk);
    });

    const init = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "jamal-cleaning-site-tools", version: "1.0.0" },
    });
    if (init.error) throw new Error(`REA initialize failed: ${init.error.message}`);
    this.notify("notifications/initialized", {});
  }

  async call(name: string, args: Record<string, unknown>, timeoutMs = 300_000): Promise<ToolResult> {
    const msg = await this.rpc("tools/call", { name, arguments: args }, timeoutMs);
    if (msg.error) throw new Error(`REA ${name} RPC error: ${msg.error.message}`);
    const result = msg.result as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content?: { type: string; text?: string }[];
    };
    let data = result.structuredContent;
    if (!data) {
      const text = result.content?.find((c) => c.type === "text")?.text ?? "{}";
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { text };
      }
    }
    return { isError: Boolean(result.isError), data };
  }

  stop(): void {
    this.child?.stdin.end();
    this.child?.kill();
    this.child = null;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.startsWith("{")) continue;
      let msg: RpcMessage;
      try {
        msg = JSON.parse(line) as RpcMessage;
      } catch {
        continue;
      }
      if (typeof msg.id === "number") {
        this.pending.get(msg.id)?.(msg);
        this.pending.delete(msg.id);
      }
    }
  }

  private rpc(method: string, params: unknown, timeoutMs = 120_000): Promise<RpcMessage> {
    const child = this.child;
    if (!child) return Promise.reject(new Error("REA client not started"));
    const id = this.nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`REA ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  private notify(method: string, params: unknown): void {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }
}

/** Evidence results keep their payload under `normalized_result`. */
export function normalized<T = Record<string, unknown>>(result: ToolResult): T {
  return (result.data.normalized_result ?? result.data) as T;
}
