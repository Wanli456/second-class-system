#!/bin/bash
set -Eeuo pipefail

WORKSPACE_PATH="${WORKSPACE_PATH:-$(pwd)}"
VENV_DIR="${OCR_VENV_DIR:-${WORKSPACE_PATH}/.ocr-venv}"

cd "${WORKSPACE_PATH}"

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_COMMAND="${PYTHON_BIN}"
elif command -v python3 > /dev/null 2>&1; then
  PYTHON_COMMAND="python3"
elif command -v python > /dev/null 2>&1; then
  PYTHON_COMMAND="python"
else
  echo "Python 3 is required to install the local OCR runtime." >&2
  exit 1
fi

if [[ -x "${VENV_DIR}/bin/python" ]]; then
  VENV_PYTHON="${VENV_DIR}/bin/python"
elif [[ -x "${VENV_DIR}/Scripts/python.exe" ]]; then
  VENV_PYTHON="${VENV_DIR}/Scripts/python.exe"
else
  "${PYTHON_COMMAND}" -m venv "${VENV_DIR}"
  if [[ -x "${VENV_DIR}/bin/python" ]]; then
    VENV_PYTHON="${VENV_DIR}/bin/python"
  else
    VENV_PYTHON="${VENV_DIR}/Scripts/python.exe"
  fi
fi

echo "Installing local OCR dependencies..."
"${VENV_PYTHON}" -m pip install --upgrade pip
"${VENV_PYTHON}" -m pip install -r local-ocr/requirements.txt
"${VENV_PYTHON}" -c "import cv2; import rapidocr_onnxruntime"

echo "Local OCR runtime is ready."
