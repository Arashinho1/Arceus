import { spawnSync } from "node:child_process";
import process from "node:process";

const candidates = process.env.PYTHON_BIN
  ? [process.env.PYTHON_BIN]
  : process.platform === "win32"
    ? ["python", "py"]
    : ["python3", "python"];

for (const command of candidates) {
  const check = runPython(command, ["-c", "import PIL"], "ignore");
  if (check.status === 0) {
    console.log(`Pillow already available through ${command}.`);
    process.exit(0);
  }

  const install = runPython(command, ["-m", "pip", "install", "-r", "requirements.txt"]);
  if (install.status === 0) {
    console.log(`Pillow installed through ${command}.`);
    process.exit(0);
  }
}

console.error("Could not install Pillow. Set PYTHON_BIN to a Python interpreter with pip available.");
process.exit(1);

function runPython(command, args, stdio = "inherit") {
  if (command === "py") {
    return spawnSync(command, ["-3", ...args], { stdio });
  }

  return spawnSync(command, args, { stdio });
}
