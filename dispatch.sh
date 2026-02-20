#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env.prod"
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"

RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"

show_logo() {
  echo ""
  echo -e "${CYAN}  ____  ___ ____  ____   _  _____ ____ _   _ ${RESET}"
  echo -e "${CYAN} |  _ \\|_ _/ ___||  _ \\ / \\|_   _/ ___| | | |${RESET}"
  echo -e "${CYAN} | | | || |\\___ \\| |_) / _ \\ | || |   | |_| |${RESET}"
  echo -e "${CYAN} | |_| || | ___) |  __/ ___ \\| || |___|  _  |${RESET}"
  echo -e "${CYAN} |____/|___|____/|_| /_/   \\_\\_| \\____|_| |_|${RESET}"
  echo ""
  echo -e "  ${DIM}v${VERSION} - Docker production launcher${RESET}"
  echo ""
}

show_help() {
  show_logo
  echo -e "  ${BOLD}USAGE${RESET}"
  echo "    ./dispatch.sh <command>"
  echo ""
  echo -e "  ${BOLD}COMMANDS${RESET}"
  echo "    setup      Interactive production setup (.env.prod + optional start)"
  echo "    start      Start Dispatch with Docker Compose (.env.prod)"
  echo "    stop       Stop running Dispatch containers"
  echo "    restart    Restart Dispatch containers"
  echo "    logs       Follow Dispatch logs"
  echo "    status     Show container status"
  echo "    pull       Pull latest image and restart"
  echo "    down       Stop and remove containers/network"
  echo "    version    Show version number"
  echo "    help       Show this help message"
  echo ""
  echo -e "  ${DIM}Production config is stored in .env.prod${RESET}"
  echo -e "  ${DIM}Developer workflow (npm build/test/dev) moved to ./dispatch-dev.sh${RESET}"
  echo ""
}

assert_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}Docker is not installed or not on PATH.${RESET}"
    exit 1
  fi
}

assert_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Missing .env.prod. Run './dispatch.sh setup' first.${RESET}"
    exit 1
  fi
}

make_auth_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' | tr -d '\n'
    return
  fi

  if [ -r /dev/urandom ] && command -v base64 >/dev/null 2>&1; then
    head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n'
    return
  fi

  printf "dispatch-local-secret-change-me"
}

get_env_value() {
  local target_key="$1"

  if [ ! -f "$ENV_FILE" ]; then
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
  done < "$ENV_FILE"

  return 1
}

prompt_value() {
  local message="$1"
  local default_value="${2:-}"
  local allow_empty="${3:-false}"
  local answer=""

  while true; do
    if [ -n "$default_value" ]; then
      read -r -p "$message (default: $default_value): " answer
    else
      read -r -p "$message: " answer
    fi

    answer="$(echo "$answer" | tr -d '\r')"

    if [ -z "$answer" ]; then
      if [ -n "$default_value" ]; then
        echo "$default_value"
        return
      fi
      if [ "$allow_empty" = "true" ]; then
        echo ""
        return
      fi
      echo -e "${YELLOW}Value is required.${RESET}"
      continue
    fi

    echo "$answer"
    return
  done
}

prompt_port() {
  local default_port="${1:-3000}"
  local value=""

  while true; do
    value="$(prompt_value "Port to run Dispatch on" "$default_port")"
    if [[ "$value" =~ ^[0-9]+$ ]] && [ "$value" -ge 1 ] && [ "$value" -le 65535 ]; then
      echo "$value"
      return
    fi
    echo -e "${YELLOW}Port must be a number between 1 and 65535.${RESET}"
  done
}

prompt_yes_no() {
  local message="$1"
  local default_yes="${2:-true}"
  local suffix="Y"
  local answer=""

  if [ "$default_yes" != "true" ]; then
    suffix="N"
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
      *) echo -e "${YELLOW}Enter y or n.${RESET}" ;;
    esac
  done
}

write_prod_env_file() {
  local auth_secret="$1"
  local nextauth_url="$2"
  local github_id="$3"
  local github_secret="$4"
  local dispatch_port="$5"
  local dispatch_image="$6"

  {
    echo "# Production runtime"
    echo "AUTH_SECRET=$auth_secret"
    echo "NEXTAUTH_URL=$nextauth_url"
    echo "AUTH_TRUST_HOST=true"
    echo "AUTH_GITHUB_ID=$github_id"
    echo "AUTH_GITHUB_SECRET=$github_secret"
    echo "DISPATCH_PORT=$dispatch_port"
    echo "DISPATCH_IMAGE=$dispatch_image"
    echo ""
  } > "$ENV_FILE"
}

run_compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

cmd_setup() {
  show_logo
  assert_docker

  local existing_port existing_url existing_image existing_secret existing_gh_id existing_gh_secret
  local port nextauth_url dispatch_image auth_secret github_id github_secret
  local use_github_default="false"

  existing_port="$(get_env_value "DISPATCH_PORT" || true)"
  existing_url="$(get_env_value "NEXTAUTH_URL" || true)"
  existing_image="$(get_env_value "DISPATCH_IMAGE" || true)"
  existing_secret="$(get_env_value "AUTH_SECRET" || true)"
  existing_gh_id="$(get_env_value "AUTH_GITHUB_ID" || true)"
  existing_gh_secret="$(get_env_value "AUTH_GITHUB_SECRET" || true)"

  if [ -z "$existing_port" ]; then
    existing_port="3000"
  fi

  port="$(prompt_port "$existing_port")"

  if [ -z "$existing_url" ]; then
    existing_url="http://localhost:$port"
  fi
  nextauth_url="$(prompt_value "Public URL for Dispatch (NEXTAUTH_URL)" "$existing_url")"

  if [ -z "$existing_image" ]; then
    existing_image="${DISPATCH_IMAGE:-ghcr.io/nkasco/dispatchtodoapp:latest}"
  fi
  dispatch_image="$(prompt_value "Container image to run (DISPATCH_IMAGE)" "$existing_image")"

  if [ -n "$existing_gh_id" ] && [ -n "$existing_gh_secret" ]; then
    use_github_default="true"
  fi

  if prompt_yes_no "Enable GitHub OAuth sign-in?" "$use_github_default"; then
    echo ""
    echo -e "${CYAN}GitHub OAuth setup:${RESET}"
    echo -e "${DIM}  1) Open: https://github.com/settings/developers${RESET}"
    echo -e "${DIM}  2) OAuth callback URL: ${nextauth_url}/api/auth/callback/github${RESET}"
    echo ""
    github_id="$(prompt_value "GitHub OAuth Client ID (AUTH_GITHUB_ID)" "$existing_gh_id")"
    github_secret="$(prompt_value "GitHub OAuth Client Secret (AUTH_GITHUB_SECRET)" "$existing_gh_secret")"
  else
    github_id=""
    github_secret=""
  fi

  if [ -z "$existing_secret" ]; then
    auth_secret="$(make_auth_secret)"
  else
    auth_secret="$existing_secret"
  fi

  write_prod_env_file "$auth_secret" "$nextauth_url" "$github_id" "$github_secret" "$port" "$dispatch_image"
  echo -e "${GREEN}Wrote .env.prod${RESET}"
  echo -e "${DIM}Image: $dispatch_image${RESET}"
  echo -e "${DIM}URL: $nextauth_url${RESET}"
  echo ""

  if prompt_yes_no "Start Dispatch now?" "true"; then
    run_compose up -d
    echo -e "${GREEN}Dispatch is running.${RESET}"
  fi
}

cmd_start() {
  show_logo
  assert_docker
  assert_env_file
  run_compose up -d
  echo -e "${GREEN}Dispatch is running.${RESET}"
}

cmd_stop() {
  show_logo
  assert_docker
  assert_env_file
  run_compose stop
}

cmd_restart() {
  show_logo
  assert_docker
  assert_env_file
  run_compose restart
}

cmd_logs() {
  show_logo
  assert_docker
  assert_env_file
  run_compose logs -f dispatch
}

cmd_status() {
  show_logo
  assert_docker
  assert_env_file
  run_compose ps
}

cmd_down() {
  show_logo
  assert_docker
  assert_env_file
  run_compose down
}

cmd_pull() {
  show_logo
  assert_docker
  assert_env_file
  run_compose pull
  echo -e "${DIM}Cleaning up old Dispatch containers...${RESET}"
  run_compose down --remove-orphans
  run_compose up -d --remove-orphans
}

COMMAND="${1:-help}"

case "$COMMAND" in
  setup) cmd_setup ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  logs) cmd_logs ;;
  status) cmd_status ;;
  down) cmd_down ;;
  pull) cmd_pull ;;
  version) echo "Dispatch v${VERSION}" ;;
  help) show_help ;;
  *)
    echo -e "${RED}Unknown command: ${COMMAND}${RESET}"
    echo ""
    show_help
    exit 1
    ;;
esac
