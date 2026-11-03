import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { env, projectRoot } from "../../src/config/env.ts";

export type ManagedProcess = {
  child: ChildProcess;
  output: () => string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

function childEnvironment(overrides: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...overrides })
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

function startNode(args: string[], cwd: string, overrides: NodeJS.ProcessEnv): ManagedProcess {
  const child = spawn(process.execPath, args, {
    cwd,
    env: childEnvironment(overrides),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false
  });
  let captured = "";
  child.stdout?.on("data", (chunk) => {
    captured += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    captured += chunk.toString();
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit, reject) => {
      child.once("error", (error) => reject(new Error(
        `Nao foi possivel iniciar o subprocesso Node: ${process.execPath} ${args.join(" ")}. ${error.message}`,
        { cause: error }
      )));
      child.once("exit", (code, signal) => resolveExit({ code, signal }));
    }
  );
  return { child, output: () => captured, exited };
}

export async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Nao foi possivel reservar uma porta local.");
  }
  const port = address.port;
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  return port;
}

export function startApiProcess(
  port: number,
  appOrigin: string,
  overrides: NodeJS.ProcessEnv = {}
) {
  const expectedDatabase = "auction_house_entregavel_test";
  if (new URL(env.databaseUrl).pathname !== `/${expectedDatabase}`) {
    throw new Error(`Processo integrado recusado fora de ${expectedDatabase}.`);
  }
  return startNode(
    [
      resolve(projectRoot, "node_modules/tsx/dist/cli.mjs"),
      resolve(projectRoot, "apps/api/src/server.ts")
    ],
    projectRoot,
    {
      NODE_ENV: "test",
      PORT: String(port),
      APP_ORIGIN: appOrigin,
      AUDIT_ANCHOR_DIR: "./data/audit/test-anchors",
      COVER_STORAGE_DIR: "./data/covers/test",
      ...overrides
    }
  );
}

export async function runTsxScript(
  relativePath: string,
  overrides: NodeJS.ProcessEnv = {}
) {
  const expectedDatabase = "auction_house_entregavel_test";
  if (new URL(env.databaseUrl).pathname !== `/${expectedDatabase}`) {
    throw new Error(`Script integrado recusado fora de ${expectedDatabase}.`);
  }
  const handle = startNode(
    [
      resolve(projectRoot, "node_modules/tsx/dist/cli.mjs"),
      resolve(projectRoot, relativePath)
    ],
    projectRoot,
    {
      NODE_ENV: "test",
      AUDIT_ANCHOR_DIR: "./data/audit/test-anchors",
      COVER_STORAGE_DIR: "./data/covers/test",
      ...overrides
    }
  );
  const result = await handle.exited;
  if (result.code !== 0) {
    throw new Error(
      `Script ${relativePath} falhou com codigo ${result.code}.\n${handle.output()}`
    );
  }
  return handle.output();
}

export async function waitForHttp(
  url: string,
  processHandle?: ManagedProcess,
  timeoutMs = 20_000
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processHandle?.child.exitCode !== null) {
      throw new Error(`Processo encerrou antes de responder ${url}.\n${processHandle.output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timeout aguardando ${url}.\n${processHandle?.output() ?? ""}`);
}

export async function stopProcess(handle: ManagedProcess | undefined) {
  if (!handle || handle.child.exitCode !== null) return;
  handle.child.kill("SIGTERM");
  const result = await Promise.race([
    handle.exited.then(() => "exited" as const),
    new Promise<"timeout">((resolveWait) => setTimeout(() => resolveWait("timeout"), 5_000))
  ]);
  if (result === "timeout" && handle.child.exitCode === null) {
    handle.child.kill("SIGKILL");
    await handle.exited;
  }
}
