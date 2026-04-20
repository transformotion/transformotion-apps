#!/usr/bin/env bash
# scripts/ci/check-required-env-vars.sh
#
# Asserts that every variable tagged [REQUIRED] in the supplied
# .env.example file is set and non-empty in the current shell
# environment.
#
# Usage:
#   scripts/ci/check-required-env-vars.sh <path-to-.env.example> <environment-name>
#
# Environment name is used for error messages and to construct the
# `gh variable set --env <name>` remediation commands.
#
# Exits 0 if all required vars are present; exits 1 with a detailed
# report otherwise.

set -euo pipefail

ENV_EXAMPLE="${1:?first argument must be path to .env.example}"
ENV_NAME="${2:?second argument must be environment name (e.g. dev, prod)}"

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "ERROR: $ENV_EXAMPLE does not exist" >&2
  exit 1
fi

# Parse [REQUIRED] vars from the .env.example.
#
# Rule: a variable is REQUIRED if the line immediately before its
# declaration (or one of the preceding comment-block lines) is a
# standalone tag line of the form "# [REQUIRED]" (nothing after the
# tag). We match strictly to avoid false positives from comment text
# that mentions [REQUIRED] inline (e.g. "promote to [REQUIRED]").
required_vars=()
current_tag=""
while IFS= read -r line; do
  if [[ "$line" =~ ^[[:space:]]*#[[:space:]]+\[REQUIRED\][[:space:]]*$ ]]; then
    current_tag="REQUIRED"
  elif [[ "$line" =~ ^[[:space:]]*#[[:space:]]+\[OPTIONAL\][[:space:]]*$ ]]; then
    current_tag="OPTIONAL"
  elif [[ "$line" =~ ^[[:space:]]*#[[:space:]]+\[PLANNED\][[:space:]]*$ ]]; then
    current_tag="PLANNED"
  elif [[ "$line" =~ ^[A-Z_][A-Z0-9_]*= ]]; then
    # Variable declaration line.
    if [[ "$current_tag" == "REQUIRED" ]]; then
      varname="${line%%=*}"
      required_vars+=("$varname")
    fi
    current_tag=""  # Reset after consuming.
  elif [[ -z "$line" ]]; then
    # Blank line resets the tag context.
    current_tag=""
  fi
  # Comment lines with other content don't reset the tag.
done < "$ENV_EXAMPLE"

if [[ ${#required_vars[@]} -eq 0 ]]; then
  echo "No [REQUIRED] variables found in $ENV_EXAMPLE — nothing to check."
  exit 0
fi

echo "Checking ${#required_vars[@]} [REQUIRED] variable(s) from $ENV_EXAMPLE against environment '$ENV_NAME'..."

missing=()
for var in "${required_vars[@]}"; do
  # Indirect expansion: get the value of the var whose name is in $var.
  value="${!var:-}"
  if [[ -z "$value" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -eq 0 ]]; then
  echo "OK: all ${#required_vars[@]} required variable(s) present and non-empty."
  exit 0
fi

# Emit a detailed, actionable error.
cat >&2 <<EOF

==============================================================================
ENV VAR CHECK FAILED

$ENV_EXAMPLE declares ${#required_vars[@]} [REQUIRED] variables.
${#missing[@]} of them are missing or empty in GitHub Actions environment '$ENV_NAME'.

Missing variables:
EOF

for var in "${missing[@]}"; do
  echo "  - $var" >&2
done

cat >&2 <<EOF

To fix, set each missing variable in the '$ENV_NAME' environment:

EOF

for var in "${missing[@]}"; do
  echo "  gh variable set $var --env $ENV_NAME --body '<value>'" >&2
done

cat >&2 <<EOF

See $ENV_EXAMPLE for descriptions of what each variable should contain.

Sub-phase 2b enforces that every [REQUIRED] variable is non-empty in the
target environment before a deploy proceeds. This is a hard fail by
design (see STABILISATION_FREEZE.md Phase 1 sub-phase 2b).
==============================================================================
EOF

exit 1
