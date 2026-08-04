#!/bin/bash
# nanobot Linux Installer
# Official installer for madkoding/nanobot
# https://github.com/madkoding/nanobot

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PACKAGE="nanobot-ai"
REPO="madkoding/nanobot"
MAIN_SOURCE="https://github.com/${REPO}/archive/refs/heads/main.zip"
INSTALL_TARGET="$PACKAGE"
INSTALL_SOURCE="PyPI"
NANOBOT_VENV="${NANOBOT_VENV:-$HOME/.nanobot/venv}"
NANOBOT_BIN_DIR="${NANOBOT_BIN_DIR:-$HOME/.local/bin}"

# Flags
DEV_MODE=false
DRY_RUN=false
SKIP_WIZARD=false
FORCE_REINSTALL=false

info() {
    echo -e "${BLUE}ℹ️  $*${NC}"
}

success() {
    echo -e "${GREEN}✅ $*${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $*${NC}"
}

error() {
    echo -e "${RED}❌ Error: $*${NC}" >&2
    exit 1
}

usage() {
    cat <<EOF
Usage: install.sh [OPTIONS]

Official nanobot installer for Linux systems.

OPTIONS:
    --dev           Install from the current main branch instead of PyPI
    --dry-run       Show what would be done without making changes
    --skip-wizard   Skip the automatic setup wizard
    --force         Force reinstall even if already installed
    -h, --help      Show this help message

EXAMPLES:
    # Install stable version from PyPI
    curl -fsSL https://raw.githubusercontent.com/madkoding/nanobot/main/scripts/install.sh | bash

    # Install development version from main branch
    curl -fsSL https://raw.githubusercontent.com/madkoding/nanobot/main/scripts/install.sh | bash -s -- --dev

    # Preview installation
    curl -fsSL https://raw.githubusercontent.com/madkoding/nanobot/main/scripts/install.sh | bash -s -- --dry-run

EOF
}

# Check if running on Linux
check_linux() {
    if [[ "$(uname -s)" != "Linux" ]]; then
        warning "This installer is designed for Linux systems."
        warning "Detected OS: $(uname -s)"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Installation aborted"
        fi
    fi
}

# Check Python version
check_python() {
    local python_cmd=""
    
    if command -v python3 &>/dev/null; then
        python_cmd="python3"
    elif command -v python &>/dev/null; then
        python_cmd="python"
    else
        error "Python not found. Please install Python 3.11 or newer."
    fi
    
    local version
    version=$("$python_cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    
    local major minor
    major=$(echo "$version" | cut -d. -f1)
    minor=$(echo "$version" | cut -d. -f2)
    
    if [[ "$major" -lt 3 ]] || [[ "$major" -eq 3 && "$minor" -lt 11 ]]; then
        error "Python 3.11 or newer required. Found: $version"
    fi
    
    PYTHON_BIN="$python_cmd"
    info "Found Python: $PYTHON_BIN (version $version)"
}

# Check and install dependencies
check_dependencies() {
    local missing_deps=()
    
    # Check for git (needed for dev mode)
    if [[ "$DEV_MODE" == true ]] && ! command -v git &>/dev/null; then
        missing_deps+=("git")
    fi
    
    # Check for unzip (needed for dev mode)
    if [[ "$DEV_MODE" == true ]] && ! command -v unzip &>/dev/null; then
        missing_deps+=("unzip")
    fi
    
    # Check for curl
    if ! command -v curl &>/dev/null; then
        missing_deps+=("curl")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        warning "Missing dependencies: ${missing_deps[*]}"
        
        if command -v apt &>/dev/null; then
            info "Installing missing dependencies with apt..."
            sudo apt update && sudo apt install -y "${missing_deps[@]}"
        elif command -v dnf &>/dev/null; then
            info "Installing missing dependencies with dnf..."
            sudo dnf install -y "${missing_deps[@]}"
        elif command -v yum &>/dev/null; then
            info "Installing missing dependencies with yum..."
            sudo yum install -y "${missing_deps[@]}"
        elif command -v pacman &>/dev/null; then
            info "Installing missing dependencies with pacman..."
            sudo pacman -S --noconfirm "${missing_deps[@]}"
        else
            error "Cannot install dependencies automatically. Please install them manually."
        fi
    fi
}

# Check if nanobot is already installed
check_existing_install() {
    if command -v nanobot &>/dev/null; then
        local current_version
        current_version=$(nanobot --version 2>&1 || echo "unknown")
        warning "nanobot is already installed: $current_version"
        
        if [[ "$FORCE_REINSTALL" != true ]]; then
            read -p "Reinstall anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                info "Installation cancelled"
                exit 0
            fi
            FORCE_REINSTALL=true
        fi
    fi
}

# Setup virtual environment
setup_venv() {
    if [[ -d "$NANOBOT_VENV" ]]; then
        info "Using existing virtual environment at $NANOBOT_VENV"
    else
        info "Creating virtual environment at $NANOBOT_VENV"
        mkdir -p "$(dirname "$NANOBOT_VENV")"
        "$PYTHON_BIN" -m venv "$NANOBOT_VENV"
    fi
    
    VENV_PYTHON="$NANOBOT_VENV/bin/python"
    VENV_PIP="$NANOBOT_VENV/bin/pip"
    
    # Upgrade pip in venv
    "$VENV_PYTHON" -m pip install --upgrade pip --quiet
}

# Install nanobot
install_nanobot() {
    local install_spec="$INSTALL_TARGET"
    
    if [[ "$DEV_MODE" == true ]]; then
        install_spec="$MAIN_SOURCE"
        INSTALL_SOURCE="GitHub main branch"
    fi
    
    info "Installing nanobot from $INSTALL_SOURCE..."
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would run: $VENV_PIP install --upgrade $install_spec"
        return 0
    fi
    
    if ! "$VENV_PIP" install --upgrade "$install_spec"; then
        error "Failed to install nanobot"
    fi
    
    success "nanobot installed successfully"
}

# Create launcher script
create_launcher() {
    local launcher="$NANOBOT_BIN_DIR/nanobot"
    
    mkdir -p "$NANOBOT_BIN_DIR"
    
    cat > "$launcher" <<EOF
#!/bin/bash
# nanobot launcher - Generated by installer
exec "$VENV_PYTHON" -m nanobot "\$@"
EOF
    
    chmod +x "$launcher"
    
    info "Created launcher at $launcher"
    
    # Add to PATH hint
    if [[ ":$PATH:" != *":$NANOBOT_BIN_DIR:"* ]]; then
        warning "$NANOBOT_BIN_DIR is not in your PATH"
        info "Add this to your ~/.bashrc or ~/.zshrc:"
        echo "export PATH=\"$NANOBOT_BIN_DIR:\$PATH\""
        
        # Try to add automatically
        if [[ -f "$HOME/.bashrc" ]]; then
            if ! grep -q "$NANOBOT_BIN_DIR" "$HOME/.bashrc"; then
                echo "" >> "$HOME/.bashrc"
                echo "# nanobot" >> "$HOME/.bashrc"
                echo "export PATH=\"$NANOBOT_BIN_DIR:\$PATH\"" >> "$HOME/.bashrc"
                info "Added to ~/.bashrc (will take effect in new shell)"
            fi
        fi
        
        if [[ -f "$HOME/.zshrc" ]]; then
            if ! grep -q "$NANOBOT_BIN_DIR" "$HOME/.zshrc"; then
                echo "" >> "$HOME/.zshrc"
                echo "# nanobot" >> "$HOME/.zshrc"
                echo "export PATH=\"$NANOBOT_BIN_DIR:\$PATH\"" >> "$HOME/.zshrc"
                info "Added to ~/.zshrc (will take effect in new shell)"
            fi
        fi
    fi
}

# Verify installation
verify_installation() {
    info "Verifying installation..."
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would verify installation"
        return 0
    fi
    
    local version
    version=$("$VENV_PYTHON" -m nanobot --version 2>&1)
    success "nanobot version: $version"
}

# Run setup wizard
run_wizard() {
    if [[ "$SKIP_WIZARD" == true ]]; then
        info "Skipping setup wizard as requested"
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would run setup wizard"
        return 0
    fi
    
    # Check if config already exists
    if [[ -f "$HOME/.nanobot/config.json" ]]; then
        info "Existing configuration found, skipping wizard"
        return 0
    fi
    
    info "Starting setup wizard..."
    echo
    echo "You can configure nanobot by running:"
    echo "  nanobot webui"
    echo
    echo "Or use the CLI wizard:"
    echo "  nanobot onboard --wizard"
    echo
}

# Print next steps
print_next_steps() {
    echo
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}🎉 nanobot installation complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] No changes were made"
        echo
        return 0
    fi
    
    echo "Next steps:"
    echo
    echo "1. Start the WebUI (recommended):"
    echo "   nanobot webui"
    echo
    echo "2. Or run a quick test:"
    echo "   nanobot agent -m \"Hello!\""
    echo
    echo "3. Configure your provider and model in Settings → Models"
    echo
    echo "For more information, visit:"
    echo "  https://github.com/madkoding/nanobot"
    echo "  https://nanobot.wiki"
    echo
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dev)
                DEV_MODE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-wizard)
                SKIP_WIZARD=true
                shift
                ;;
            --force)
                FORCE_REINSTALL=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done
}

# Main installation flow
main() {
    parse_args "$@"
    
    echo
    echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     nanobot Linux Installer          ║${NC}"
    echo -e "${BLUE}║     github.com/madkoding/nanobot     ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
    echo
    
    check_linux
    check_python
    check_dependencies
    check_existing_install
    
    if [[ "$DRY_RUN" == true ]]; then
        info "=== DRY RUN MODE ==="
        info "No changes will be made to your system"
        echo
    fi
    
    setup_venv
    install_nanobot
    create_launcher
    verify_installation
    run_wizard
    print_next_steps
}

# Run main function
main "$@"
