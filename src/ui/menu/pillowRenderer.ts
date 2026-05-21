import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type TrainerCardRenderInput = {
  trainer: {
    name: string;
    money: number;
    pokedex: number;
    avatarUrl: string;
  };
  badges: string[];
  team: Array<{
    name: string;
    spriteUrl: string | null;
  }>;
};

type ItemCardRenderInput = {
  item: {
    name: string;
    quantity: number;
    category: string;
    categoryLabel: string;
    spriteUrl: string | null;
    description: string;
  };
};

const PYTHON_CANDIDATES = process.env.PYTHON_BIN
  ? [process.env.PYTHON_BIN]
  : process.platform === "win32"
    ? ["python", "py"]
    : ["python3", "python"];

export async function renderTrainerCardWithPillow(input: TrainerCardRenderInput): Promise<Buffer> {
  return renderWithPillow({
    mode: "trainer_card",
    ...input
  });
}

export async function renderItemCardWithPillow(input: ItemCardRenderInput): Promise<Buffer> {
  return renderWithPillow({
    mode: "item_card",
    ...input
  });
}

async function renderWithPillow(payload: unknown): Promise<Buffer> {
  const errors: string[] = [];

  for (const command of PYTHON_CANDIDATES) {
    try {
      return await runRenderer(command, payload);
    } catch (error) {
      errors.push(`${command}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Nao foi possivel renderizar com Pillow. ${errors.join(" | ")}`);
}

function runRenderer(command: string, payload: unknown): Promise<Buffer> {
  const args = command === "py" ? ["-3", rendererPath()] : [rendererPath()];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      const output = Buffer.concat(stdout);
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(errorOutput || `processo saiu com codigo ${code ?? "desconhecido"}`));
        return;
      }

      if (output.length === 0) {
        reject(new Error("renderer nao retornou imagem"));
        return;
      }

      resolve(output);
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function rendererPath(): string {
  return path.join(projectRoot(), "scripts", "render_trainer_card.py");
}

function projectRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..", "..");
}
