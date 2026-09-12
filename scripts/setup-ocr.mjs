import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = process.env.WORKSPACE_PATH || process.cwd();
const venvDir = process.env.OCR_VENV_DIR || path.join(root, '.ocr-venv');
const venvPython = process.platform === 'win32'
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (existsSync(venvPython)) {
  const ready = spawnSync(venvPython, ['-c', 'import cv2; import rapidocr_onnxruntime'], { stdio: 'ignore' }).status === 0;
  if (ready) {
    console.log('Local OCR runtime is already ready.');
    process.exit(0);
  }
} else {
  const pythonCandidates = process.env.PYTHON_BIN
    ? [process.env.PYTHON_BIN]
    : process.platform === 'win32' ? ['python'] : ['python3', 'python'];
  const python = pythonCandidates.find((candidate) => spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0);
  if (!python) throw new Error('Python 3 is required to install the local OCR runtime.');
  run(python, ['-m', 'venv', venvDir]);
}

console.log('Installing local OCR dependencies...');
run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(venvPython, ['-m', 'pip', 'install', '-r', path.join(root, 'local-ocr', 'requirements.txt')]);
run(venvPython, ['-c', 'import cv2; import rapidocr_onnxruntime']);
console.log('Local OCR runtime is ready.');
