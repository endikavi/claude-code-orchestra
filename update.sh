#!/usr/bin/env bash
set -euo pipefail

REPO="endikavi/claude-code-orchestra"
INSTALL_DIR=""
CURRENT_VERSION=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
debug() { echo -e "${BLUE}[DEBUG]${NC} $1"; }

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

# Find existing installation
find_installation() {
  # Check common locations
  local locations=(
    "/usr/local/bin/orchestra"
    "$HOME/.local/bin/orchestra"
    "/opt/orchestra/orchestra"
  )

  for loc in "${locations[@]}"; do
    if [ -x "$loc" ]; then
      echo "$loc"
      return 0
    fi
  done

  # Try which
  if command -v orchestra &> /dev/null; then
    which orchestra
    return 0
  fi

  echo ""
}

# Get current installed version
get_current_version() {
  local install_path="$1"

  if [ -z "$install_path" ] || [ ! -x "$install_path" ]; then
    echo "not_installed"
    return
  fi

  # Try to get version from the binary
  # AppImage usually supports --version
  local version
  version=$("$install_path" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?' || echo "unknown")

  if [ -z "$version" ] || [ "$version" = "unknown" ]; then
    # Check if there's a version file nearby
    local dir=$(dirname "$install_path")
    if [ -f "$dir/.orchestra-version" ]; then
      version=$(cat "$dir/.orchestra-version")
    fi
  fi

  echo "${version:-unknown}"
}

# Get latest version from GitHub API
get_latest_version() {
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null |
    grep '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/' || echo ""
}

# Compare versions (returns 0 if $1 < $2)
version_lt() {
  [ "$1" = "$2" ] && return 1
  local IFS=.
  local i ver1=($1) ver2=($2)

  # Remove pre-release suffix for comparison
  ver1[0]=${ver1[0]%-*}
  ver2[0]=${ver2[0]%-*}

  for ((i=0; i<${#ver1[@]}; i++)); do
    if [[ -z ${ver2[i]:-} ]]; then
      return 1
    fi
    if ((10#${ver1[i]:-0} < 10#${ver2[i]:-0})); then
      return 0
    fi
    if ((10#${ver1[i]:-0} > 10#${ver2[i]:-0})); then
      return 1
    fi
  done
  return 1
}

# Download and update
do_update() {
  local os=$(detect_os)
  local arch=$(detect_arch)
  local version="$1"
  local install_path="$2"

  INSTALL_DIR=$(dirname "$install_path")

  local filename=""
  case "$os" in
    linux)
      filename="Orchestra-${version}.AppImage"
      ;;
    macos)
      if [ "$arch" = "arm64" ]; then
        filename="Orchestra-${version}-arm64.dmg"
      else
        filename="Orchestra-${version}.dmg"
      fi
      ;;
  esac

  local url="https://github.com/$REPO/releases/download/v${version}/$filename"

  info "Downloading $filename..."

  if [ "$os" = "linux" ]; then
    # Backup current version
    if [ -f "$install_path" ]; then
      cp "$install_path" "${install_path}.backup"
      info "Backed up current version to ${install_path}.backup"
    fi

    # Download new version
    curl -fsSL "$url" -o "$install_path.new"
    chmod +x "$install_path.new"

    # Replace
    mv "$install_path.new" "$install_path"

    # Save version info
    echo "$version" > "$INSTALL_DIR/.orchestra-version"

    info "Updated to version $version"
  else
    # macOS: download DMG to /tmp
    local tmpfile="/tmp/$filename"
    curl -fsSL "$url" -o "$tmpfile"
    info "Downloaded DMG to $tmpfile"
    info "Please open the DMG and drag Orchestra to Applications to complete the update"
  fi
}

# Check only mode
check_update() {
  local current="$1"
  local latest="$2"

  echo ""
  echo "Current version: $current"
  echo "Latest version:  $latest"
  echo ""

  if [ "$current" = "not_installed" ]; then
    warn "Orchestra is not installed. Run install.sh instead."
    return 1
  fi

  if [ "$current" = "unknown" ]; then
    warn "Could not determine current version."
    echo "Latest available version is $latest"
    return 0
  fi

  if [ "$current" = "$latest" ]; then
    info "You are running the latest version!"
    return 0
  fi

  if version_lt "$current" "$latest"; then
    info "A new version is available: $latest"
    return 2
  else
    info "You are running a newer version than the latest release."
    return 0
  fi
}

# Main
main() {
  local check_only=false
  local force=false

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      -c|--check)
        check_only=true
        shift
        ;;
      -f|--force)
        force=true
        shift
        ;;
      -h|--help)
        echo "Orchestra Update Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  -c, --check   Check for updates without installing"
        echo "  -f, --force   Force update even if already on latest version"
        echo "  -h, --help    Show this help message"
        exit 0
        ;;
      *)
        error "Unknown option: $1"
        ;;
    esac
  done

  echo ""
  echo "========================================"
  echo "       Orchestra Update Checker         "
  echo "========================================"
  echo ""

  # Find current installation
  local install_path=$(find_installation)

  if [ -z "$install_path" ]; then
    warn "Orchestra installation not found."
    warn "Run install.sh to install Orchestra first."
    exit 1
  fi

  info "Found installation at: $install_path"

  # Get versions
  local current=$(get_current_version "$install_path")
  local latest=$(get_latest_version)

  if [ -z "$latest" ]; then
    error "Could not fetch latest version from GitHub"
  fi

  # Check mode
  if $check_only; then
    check_update "$current" "$latest"
    exit $?
  fi

  # Update mode
  check_update "$current" "$latest"
  local check_result=$?

  if [ $check_result -eq 0 ] && ! $force; then
    echo ""
    info "No update needed."
    exit 0
  fi

  if [ $check_result -eq 1 ]; then
    exit 1
  fi

  # Confirm update
  echo ""
  read -p "Do you want to update? [y/N] " -n 1 -r
  echo

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Update cancelled."
    exit 0
  fi

  # Perform update
  do_update "$latest" "$install_path"

  echo ""
  info "Update complete!"
  echo ""
}

main "$@"
