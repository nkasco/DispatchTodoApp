#!/usr/bin/env bash
#
# Dispatch developer launcher for the Dispatch task management app.
#
# Usage:
#   ./scripts/launchers/dispatch-dev.sh <command>
#   ./scripts/launchers/dispatch-dev.sh setup full
#
# Commands:
#   setup    Interactive setup (.env + Docker Compose startup)
#   dev      Start the development server
#   start    Start the production server
#   build    Create a production build
#   update   Pull latest, install deps, run migrations
#   updateself Download latest version of this launcher script
#   seed     Load sample data
#   studio   Open Drizzle Studio (database GUI)
#   test     Run the test suite
#   lint     Run ESLint
#   publish  Publish amd64 image + additional arm64 image
#   publishpreprod Publish amd64-only preprod image tag (no arm64 build)
#   resetdb  Remove dev Docker volumes (fresh SQLite state)
#   freshstart Run full dev cleanup (containers, volumes, local images)
#   version  Show version number
#   help     Show this help message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPT_FILE="$SCRIPT_DIR/dispatch-dev.sh"
cd "$REPO_ROOT"
REPO_OWNER="nkasco"
REPO_NAME="DispatchTodoApp"
SCRIPT_REPO_PATH="scripts/launchers/dispatch-dev.sh"

# ── Version ───────────────────────────────────────────────────
PACKAGE_META="$(node -e 'const p=require("./package.json"); const name=((p.name||"dispatch").replace(/[-_]+/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())); const version=p.version||"0.0.0"; process.stdout.write(name + "|" + version);' 2>/dev/null || echo "Dispatch|0.0.0")"
IFS='|' read -r APP_NAME VERSION <<< "$PACKAGE_META"
VERSION_MONIKER="${APP_NAME} v${VERSION}"

# ── Colors ────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
UNDERLINE="\033[4m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"

# 256-color palette for gradient
C1="\033[38;5;51m"
C2="\033[38;5;50m"
C3="\033[38;5;44m"
C4="\033[38;5;38m"
C5="\033[38;5;32m"
C6="\033[38;5;44m"

# ── Logo ──────────────────────────────────────────────────────
show_logo() {
    echo ""
    echo -e "${C1}  ██████╗ ██╗███████╗██████╗  █████╗ ████████╗ ██████╗██╗  ██╗${RESET}"
    echo -e "${C2}  ██╔══██╗██║██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║  ██║${RESET}"
    echo -e "${C3}  ██║  ██║██║███████╗██████╔╝███████║   ██║   ██║     ███████║${RESET}"
    echo -e "${C4}  ██║  ██║██║╚════██║██╔═══╝ ██╔══██║   ██║   ██║     ██╔══██║${RESET}"
    echo -e "${C5}  ██████╔╝██║███████║██║     ██║  ██║   ██║   ╚██████╗██║  ██║${RESET}"
    echo -e "${C6}  ╚═════╝ ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝${RESET}"
    echo ""
    echo -e "  ${DIM}${VERSION_MONIKER} - Developer launcher (requires npm)${RESET}"
    echo ""
}

# ── Help ──────────────────────────────────────────────────────
show_help() {
    show_logo

    echo -e "  ${BOLD}USAGE${RESET}"
    echo -e "    ./scripts/launchers/dispatch-dev.sh ${CYAN}<command>${RESET}"
    echo ""
    echo -e "  ${BOLD}COMMANDS${RESET}"

    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "setup"   "Interactive setup (.env + Docker Compose startup)"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "dev"     "Start the development server (http://localhost:3000)"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "start"   "Start the production server"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "build"   "Create a production build"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "update"  "Pull latest changes, install deps, run migrations"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "updateself" "Download the latest version of this launcher from GitHub"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "seed"    "Load sample data into the database"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "studio"  "Open Drizzle Studio (database GUI)"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "test"    "Run the test suite"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "lint"    "Run ESLint"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "publish" "Publish amd64 image + additional arm64 image"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "publishpreprod" "Publish amd64-only preprod image tag (no arm64 build)"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "resetdb" "Remove dev Docker volumes (fresh SQLite state)"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "freshstart" "Run full dev cleanup (containers, volumes, local images)"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "version" "Show version number"
    printf "    ${CYAN}%-10s${RESET} ${DIM}%s${RESET}\n" "help"    "Show this help message"
    echo ""
    echo -e "  ${DIM}Tip: './scripts/launchers/dispatch-dev.sh setup full' performs full dev Docker cleanup first.${RESET}"
    echo ""
}

# ── Prerequisite checks ──────────────────────────────────────
assert_node_modules() {
    if [ ! -d "node_modules" ]; then
        echo -e "  ${YELLOW}Dependencies not installed. Running npm install...${RESET}"
        echo ""
        npm install
        if [ $? -ne 0 ]; then
            echo -e "  ${RED}npm install failed. Please fix errors and retry.${RESET}"
            exit 1
        fi
        echo ""
    fi
}

get_env_file_value() {
    local target_key="$1"

    if [ ! -f ".env.local" ]; then
        return 1
    fi

    while IFS= read -r raw_line || [ -n "$raw_line" ]; do
        local line="${raw_line%$'\r'}"

        case "$line" in
            ""|\#*)
                continue
                ;;
            "$target_key="*)
                echo "${line#*=}"
                return 0
                ;;
        esac
    done < ".env.local"

    return 1
}

derive_arm_image_tag() {
    local image="$1"
    local last_segment=""
    local repo=""
    local tag=""

    if [[ "$image" == *"@"* ]]; then
        echo -e "  ${RED}Digest-based image references are not supported for ARM tag derivation: ${image}${RESET}" >&2
        return 1
    fi

    last_segment="${image##*/}"
    if [[ "$last_segment" == *:* ]]; then
        repo="${image%:*}"
        tag="${image##*:}"
    else
        repo="$image"
        tag="latest"
    fi

    printf "%s:%s-arm64" "$repo" "$tag"
}

derive_preprod_image_tag() {
    local image="$1"
    local last_segment=""
    local repo=""

    if [[ "$image" == *"@"* ]]; then
        echo -e "  ${RED}Digest-based image references are not supported for preprod tag derivation: ${image}${RESET}" >&2
        return 1
    fi

    last_segment="${image##*/}"
    if [[ "$last_segment" == *:* ]]; then
        repo="${image%:*}"
    else
        repo="$image"
    fi

    printf "%s:preprod" "$repo"
}

ensure_buildx_builder() {
    local builder_name="${1:-dispatch-multiarch}"

    if ! docker buildx version >/dev/null 2>&1; then
        echo -e "  ${RED}Docker Buildx is required for ARM publishing. Install or enable Docker Buildx and retry.${RESET}"
        exit 1
    fi

    echo -e "  ${DIM}Installing binfmt emulation for arm64 (QEMU)...${RESET}"
    docker run --privileged --rm tonistiigi/binfmt --install arm64 >/dev/null

    if ! docker buildx inspect "$builder_name" >/dev/null 2>&1; then
        echo -e "  ${DIM}Creating Buildx builder '${builder_name}'...${RESET}"
        docker buildx create --name "$builder_name" --driver docker-container --use >/dev/null
    else
        docker buildx use "$builder_name" >/dev/null
    fi

    docker buildx inspect --bootstrap >/dev/null
}

prompt_yes_no() {
    local message="$1"
    local default_yes="${2:-false}"
    local suffix="N"
    local answer=""

    if [ "$default_yes" = "true" ]; then
        suffix="Y"
    fi

    while true; do
        read -r -p "$message [y/n] (default: $suffix): " answer
        answer="$(echo "$answer" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"

        if [ -z "$answer" ]; then
            if [ "$default_yes" = "true" ]; then
                return 0
            fi
            return 1
        fi

        case "$answer" in
            y|yes) return 0 ;;
            n|no) return 1 ;;
            *) echo -e "  ${YELLOW}Enter y or n.${RESET}" ;;
        esac
    done
}

has_http_client() {
    command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1
}

download_to_file() {
    local url="$1"
    local output_file="$2"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$output_file"
        return $?
    fi

    if command -v wget >/dev/null 2>&1; then
        wget -q -O "$output_file" "$url"
        return $?
    fi

    return 1
}

get_repo_default_branch() {
    local api_url="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"
    local payload=""
    local branch=""

    if command -v curl >/dev/null 2>&1; then
        payload="$(curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: DispatchLauncher" "$api_url" 2>/dev/null || true)"
    elif command -v wget >/dev/null 2>&1; then
        payload="$(wget -q -O - "$api_url" 2>/dev/null || true)"
    fi

    branch="$(printf "%s" "$payload" | sed -n 's/.*"default_branch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    if [ -z "$branch" ]; then
        branch="main"
    fi

    echo "$branch"
}

# ── Commands ──────────────────────────────────────────────────
full_dev_cleanup() {
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "  ${RED}Docker is not installed or not on PATH.${RESET}"
        exit 1
    fi

    echo -e "  ${YELLOW}Running full dev Docker cleanup...${RESET}"
    echo ""

    if [ -f ".env.local" ]; then
        docker compose -f docker-compose.dev.yml --env-file .env.local down -v --remove-orphans
    else
        docker compose -f docker-compose.dev.yml down -v --remove-orphans
    fi

    # Remove additional Dispatch-related containers that are not registry-backed.
    mapfile -t container_ids < <(docker ps -a --format '{{.ID}}|{{.Image}}|{{.Names}}' | awk -F'|' '
        BEGIN { IGNORECASE=1 }
        {
          id=$1; image=$2; name=$3;
          is_dispatch=(name ~ /dispatch/ || image ~ /dispatch/);
          is_registry=(image ~ /\//);
          if (is_dispatch && !is_registry) print id;
        }
    ')
    if [ ${#container_ids[@]} -gt 0 ]; then
        docker rm -f "${container_ids[@]}" >/dev/null
    fi

    # Remove Dispatch-related volumes.
    mapfile -t volume_names < <(docker volume ls --format '{{.Name}}' | grep -Ei 'dispatch' || true)
    if [ ${#volume_names[@]} -gt 0 ]; then
        docker volume rm "${volume_names[@]}" >/dev/null
    fi

    # Remove local Dispatch images (keep ghcr registry images).
    mapfile -t image_ids < <(docker image ls --format '{{.Repository}}|{{.Tag}}|{{.ID}}' | awk -F'|' '
        BEGIN { IGNORECASE=1 }
        {
          repo=$1; id=$3;
          is_dispatch=(repo ~ /dispatch/);
          is_registry=(repo ~ /\//);
          if (is_dispatch && !is_registry) print id;
        }
    ' | sort -u)
    if [ ${#image_ids[@]} -gt 0 ]; then
        docker image rm -f "${image_ids[@]}" >/dev/null
    fi

    echo ""
    echo -e "  ${GREEN}Full dev Docker cleanup complete.${RESET}"
    echo ""
}

cmd_setup() {
    local mode="${1:-}"
    show_logo
    if [ -n "$mode" ] && [ "$mode" != "full" ]; then
        echo -e "  ${RED}Invalid setup mode: ${mode}${RESET}"
        echo -e "  ${DIM}Use: ./scripts/launchers/dispatch-dev.sh setup full${RESET}"
        exit 1
    fi
    if [ "$mode" = "full" ]; then
        full_dev_cleanup
    fi
    assert_node_modules
    npx tsx scripts/setup.ts
}

cmd_dev() {
    show_logo
    assert_node_modules
    echo -e "  ${GREEN}Starting development server...${RESET}"
    echo -e "  ${DIM}http://localhost:3000${RESET}"
    echo ""
    npm run dev
}

cmd_start() {
    show_logo
    assert_node_modules
    echo -e "  ${GREEN}Starting production server...${RESET}"
    echo ""
    npm run start
}

cmd_build() {
    show_logo
    assert_node_modules
    echo -e "  ${GREEN}Creating production build...${RESET}"
    echo ""
    npm run build
}

cmd_update() {
    show_logo
    echo -e "  ${GREEN}Updating Dispatch...${RESET}"
    echo ""

    # Pull latest changes
    echo -e "  [1/3] ${CYAN}Pulling latest changes...${RESET}"
    git pull || echo -e "  ${YELLOW}Git pull failed — you may have local changes. Continuing...${RESET}"
    echo ""

    # Install dependencies
    echo -e "  [2/3] ${CYAN}Installing dependencies...${RESET}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "  ${RED}npm install failed.${RESET}"
        exit 1
    fi
    echo ""

    # Run migrations
    echo -e "  [3/3] ${CYAN}Running database migrations...${RESET}"
    npm run db:migrate || echo -e "  ${YELLOW}No pending migrations or migration failed.${RESET}"
    echo ""

    echo -e "  ${GREEN}Update complete!${RESET}"
    echo ""
}

cmd_updateself() {
    show_logo

    if ! has_http_client; then
        echo -e "  ${RED}Missing HTTP client. Install curl or wget to use updateself.${RESET}"
        exit 1
    fi

    local default_branch
    default_branch="$(get_repo_default_branch)"
    local candidate_urls=(
        "https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${default_branch}/${SCRIPT_REPO_PATH}"
    )
    if [ "$default_branch" != "main" ]; then
        candidate_urls+=("https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${SCRIPT_REPO_PATH}")
    fi
    if [ "$default_branch" != "master" ]; then
        candidate_urls+=("https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/master/${SCRIPT_REPO_PATH}")
    fi

    local tmp_file
    tmp_file="$(mktemp)"
    trap 'rm -f "$tmp_file"' RETURN

    local downloaded_url=""
    for url in "${candidate_urls[@]}"; do
        if download_to_file "$url" "$tmp_file"; then
            downloaded_url="$url"
            break
        fi
    done

    if [ -z "$downloaded_url" ] || [ ! -s "$tmp_file" ]; then
        echo -e "  ${RED}Failed to download latest script from GitHub.${RESET}"
        exit 1
    fi

    mv "$tmp_file" "$SCRIPT_FILE"
    trap - RETURN
    if command -v chmod >/dev/null 2>&1; then
        chmod +x "$SCRIPT_FILE" || true
    fi

    echo -e "  ${GREEN}Updated launcher from:${RESET} ${downloaded_url}"
    echo -e "  ${DIM}Saved to: $SCRIPT_FILE${RESET}"
    echo ""
}

cmd_seed() {
    show_logo
    assert_node_modules
    echo -e "  ${GREEN}Seeding database with sample data...${RESET}"
    echo ""
    npm run db:seed
}

cmd_studio() {
    show_logo
    assert_node_modules
    echo -e "  ${GREEN}Opening Drizzle Studio...${RESET}"
    echo -e "  ${DIM}Browse your database at https://local.drizzle.studio${RESET}"
    echo ""
    npm run db:studio
}

cmd_test() {
    show_logo
    assert_node_modules
    echo -e "  ${GREEN}Running tests...${RESET}"
    echo ""
    npm test
}

cmd_lint() {
    show_logo
    assert_node_modules
    echo -e "  ${GREEN}Running ESLint...${RESET}"
    echo ""
    npm run lint
}

cmd_publish() {
    show_logo
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "  ${RED}Docker is not installed or not on PATH.${RESET}"
        exit 1
    fi

    local source_image="${DISPATCH_DEV_IMAGE:-}"
    local target_image="${DISPATCH_IMAGE:-}"

    if [ -z "$source_image" ]; then
        source_image="$(get_env_file_value "DISPATCH_DEV_IMAGE" || true)"
    fi
    if [ -z "$source_image" ]; then
        source_image="dispatch:latest"
    fi

    if [ -z "$target_image" ]; then
        target_image="$(get_env_file_value "DISPATCH_IMAGE" || true)"
    fi
    if [ -z "$target_image" ]; then
        target_image="ghcr.io/nkasco/dispatchtodoapp:latest"
    fi

    echo -e "  [1/4] ${CYAN}Building image (${source_image}) with docker-compose.dev.yml...${RESET}"
    if [ -f ".env.local" ]; then
        docker compose -f docker-compose.dev.yml --env-file .env.local build
    else
        docker compose -f docker-compose.dev.yml build
    fi
    echo ""

    echo -e "  [2/4] ${CYAN}Tagging image for publish target (${target_image})...${RESET}"
    if [ "$source_image" != "$target_image" ]; then
        docker tag "$source_image" "$target_image"
    else
        echo -e "  ${DIM}Source and target image are identical; skipping tag.${RESET}"
    fi
    echo ""

    echo -e "  [3/4] ${CYAN}Pushing image (${target_image})...${RESET}"
    docker push "$target_image" || {
        echo -e "  ${RED}Docker push failed. Make sure you are logged into the target registry.${RESET}"
        exit 1
    }
    echo ""

    local arm_image=""
    local buildx_builder="${DISPATCH_BUILDX_BUILDER:-dispatch-multiarch}"
    arm_image="$(derive_arm_image_tag "$target_image")"

    echo -e "  [4/4] ${CYAN}Building and pushing ARM image (${arm_image}) with Buildx/QEMU...${RESET}"
    ensure_buildx_builder "$buildx_builder"
    docker buildx build --platform linux/arm64 --file Dockerfile --tag "$arm_image" --push . || {
        echo -e "  ${RED}ARM image build/push failed.${RESET}"
        exit 1
    }
    echo ""

    echo -e "  ${GREEN}Publish complete:${RESET}"
    echo -e "  ${DIM}  amd64: ${target_image}${RESET}"
    echo -e "  ${DIM}  arm64: ${arm_image}${RESET}"
    echo ""
}

cmd_publishpreprod() {
    show_logo
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "  ${RED}Docker is not installed or not on PATH.${RESET}"
        exit 1
    fi

    local source_image="${DISPATCH_DEV_IMAGE:-}"
    local target_image="${DISPATCH_PREPROD_IMAGE:-}"
    local base_image=""

    if [ -z "$source_image" ]; then
        source_image="$(get_env_file_value "DISPATCH_DEV_IMAGE" || true)"
    fi
    if [ -z "$source_image" ]; then
        source_image="dispatch:latest"
    fi

    if [ -z "$target_image" ]; then
        target_image="$(get_env_file_value "DISPATCH_PREPROD_IMAGE" || true)"
    fi
    if [ -z "$target_image" ]; then
        base_image="${DISPATCH_IMAGE:-}"
        if [ -z "$base_image" ]; then
            base_image="$(get_env_file_value "DISPATCH_IMAGE" || true)"
        fi
        if [ -z "$base_image" ]; then
            base_image="ghcr.io/nkasco/dispatchtodoapp:latest"
        fi
        target_image="$(derive_preprod_image_tag "$base_image")"
    fi

    echo -e "  [1/3] ${CYAN}Building image (${source_image}) with docker-compose.dev.yml...${RESET}"
    if [ -f ".env.local" ]; then
        docker compose -f docker-compose.dev.yml --env-file .env.local build
    else
        docker compose -f docker-compose.dev.yml build
    fi
    echo ""

    echo -e "  [2/3] ${CYAN}Tagging image for preprod target (${target_image})...${RESET}"
    if [ "$source_image" != "$target_image" ]; then
        docker tag "$source_image" "$target_image"
    else
        echo -e "  ${DIM}Source and target image are identical; skipping tag.${RESET}"
    fi
    echo ""

    echo -e "  [3/3] ${CYAN}Pushing preprod image (${target_image})...${RESET}"
    docker push "$target_image" || {
        echo -e "  ${RED}Docker push failed. Make sure you are logged into the target registry.${RESET}"
        exit 1
    }
    echo ""

    echo -e "  ${GREEN}Preprod publish complete (amd64 only):${RESET}"
    echo -e "  ${DIM}  image: ${target_image}${RESET}"
    echo ""
}

cmd_resetdb() {
    show_logo
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "  ${RED}Docker is not installed or not on PATH.${RESET}"
        exit 1
    fi

    echo -e "  ${YELLOW}Removing dev Docker containers and volumes...${RESET}"
    echo ""
    if [ -f ".env.local" ]; then
        docker compose -f docker-compose.dev.yml --env-file .env.local down -v --remove-orphans
    else
        docker compose -f docker-compose.dev.yml down -v --remove-orphans
    fi
    echo ""
    echo -e "  ${GREEN}Dev Docker data reset complete.${RESET}"
    echo ""
}

cmd_freshstart() {
    show_logo
    if ! prompt_yes_no "This will remove Dispatch dev containers, volumes, and local images. Continue?" "false"; then
        echo -e "  ${YELLOW}Fresh start cancelled.${RESET}"
        echo ""
        return
    fi

    full_dev_cleanup
}

# ── Route ─────────────────────────────────────────────────────
COMMAND="${1:-help}"
SETUP_MODE="${2:-}"

if [ -n "$SETUP_MODE" ] && [ "$COMMAND" != "setup" ]; then
    echo -e "  ${RED}Invalid extra argument for command '${COMMAND}': ${SETUP_MODE}${RESET}"
    echo -e "  ${DIM}Use: ./scripts/launchers/dispatch-dev.sh setup full${RESET}"
    exit 1
fi

case "$COMMAND" in
    setup)   cmd_setup "$SETUP_MODE" ;;
    dev)     cmd_dev ;;
    start)   cmd_start ;;
    build)   cmd_build ;;
    update)  cmd_update ;;
    updateself) cmd_updateself ;;
    seed)    cmd_seed ;;
    studio)  cmd_studio ;;
    test)    cmd_test ;;
    lint)    cmd_lint ;;
    publish) cmd_publish ;;
    publishpreprod) cmd_publishpreprod ;;
    resetdb) cmd_resetdb ;;
    freshstart) cmd_freshstart ;;
    version) echo "${VERSION_MONIKER}" ;;
    help)    show_help ;;
    *)
        echo -e "  ${RED}Unknown command: ${COMMAND}${RESET}"
        echo ""
        show_help
        exit 1
        ;;
esac
