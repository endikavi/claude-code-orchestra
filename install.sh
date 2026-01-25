#!/usr/bin/env bash
set -euo pipefail

REPO="endikavi/claude-code-orchestra"
INSTALL_DIR=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    *)       error "Unsupported OS: $(uname -s)" ;;
  esac
}

# Detect architecture
detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)            error "Unsupported architecture: $(uname -m)" ;;
  esac
}

# Determine install directory (auto-detect permissions)
get_install_dir() {
  if [ -w "/usr/local/bin" ]; then
    echo "/usr/local/bin"
  else
    mkdir -p "$HOME/.local/bin"
    echo "$HOME/.local/bin"
  fi
}

# Get latest version from GitHub API
get_latest_version() {
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install
install_orchestra() {
  local os=$(detect_os)
  local arch=$(detect_arch)
  local version=$(get_latest_version)
  INSTALL_DIR=$(get_install_dir)

  info "Detected: $os ($arch)"
  info "Latest version: $version"
  info "Install directory: $INSTALL_DIR"

  local filename=""
  case "$os" in
    linux)
      filename="Orchestra-${version#v}.AppImage"
      ;;
    macos)
      if [ "$arch" = "arm64" ]; then
        filename="Orchestra-${version#v}-arm64.dmg"
      else
        filename="Orchestra-${version#v}.dmg"
      fi
      ;;
  esac

  local url="https://github.com/$REPO/releases/download/$version/$filename"

  info "Downloading $filename..."
  info "URL: $url"

  if [ "$os" = "linux" ]; then
    curl -fsSL "$url" -o "$INSTALL_DIR/orchestra"
    chmod +x "$INSTALL_DIR/orchestra"
  else
    # macOS: download DMG to /tmp and mount
    local tmpfile="/tmp/$filename"
    curl -fsSL "$url" -o "$tmpfile"
    info "Downloaded DMG to $tmpfile"
    info "Please open the DMG and drag Orchestra to Applications"
  fi

  echo ""
  info "Installation complete!"

  # Verify PATH
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    warn "$INSTALL_DIR is not in your PATH"
    warn "Add this to your shell config:"
    echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
  fi
}

# Main
echo "╔═══════════════════════════════════════╗"
echo "║     Orchestra Installer               ║"
echo "╚═══════════════════════════════════════╝"
echo ""

install_orchestra
