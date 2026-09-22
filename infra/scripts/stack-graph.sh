#!/usr/bin/env bash
# The dependency graph of the deployed stack, which SST does not have and Pulumi does.
#
# `pulumi stack graph` reads the graph out of a stack's most recent deployment — of a stack in a
# BACKEND, which is the one thing an SST app has no such thing as: SST keeps the state in its own
# bootstrap bucket and never points `pulumi` at it. So this builds the missing half. `sst state
# export` prints that deployment, and the rest is a throwaway file backend in a temp directory to
# import it into, so that the real `pulumi stack graph` has a stack to operate on.
#
# The project and the stack of that throwaway are read OFF THE STATE rather than from the config,
# because they have to match: a URN is `urn:pulumi:<stage>::<app>::<type>::<name>`, and an import
# into a stack the URNs do not name is refused.
#
# The copy is read-only and deleted on the way out — nothing here writes to the state SST keeps,
# which is why `--force` and `--disable-integrity-checking` are safe to pass: they keep a state that
# has been hand-edited (`sst state edit`) from turning a picture into an error.
#
#   ./infra/scripts/stack-graph.sh dev                      # .sst/graph/dev.dot, and .svg
#   ./infra/scripts/stack-graph.sh dev --short-node-name    # names instead of whole URNs
#   ./infra/scripts/stack-graph.sh dev --ignore-parent-edges --dependency-edge-color '#246C60'
#
# Everything after the stage is handed to `pulumi stack graph` as it is — see
# https://www.pulumi.com/docs/iac/cli/commands/pulumi_stack_graph/
set -euo pipefail
cd "$(dirname "$0")/../.."

# The first argument is the stage unless it is a flag, which is what lets the stage be left out
# and the flags given on their own: `stack-graph.sh --short-node-name`.
STAGE="${SST_STAGE:-}"
if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
  STAGE="$1"
  shift
fi
if [ -z "$STAGE" ]; then
  # The stage of the last `sst` command, which is what the CLI itself falls back to.
  STAGE="$(cat .sst/stage 2>/dev/null || echo dev)"
fi

FORMAT="${STACK_GRAPH_FORMAT:-svg}"
OUT_DIR=".sst/graph"
DOT="$OUT_DIR/$STAGE.dot"

for tool in jq pulumi; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed — brew install $tool" >&2; exit 1; }
done

# Pulumi narrates the throwaway backend it is handed, and none of it is about this stack. Said only
# when the command it belongs to failed, which is when it stops being noise.
quietly() {
  local log="$WORK/pulumi.log"
  if ! "$@" >"$log" 2>&1; then
    cat "$log" >&2
    return 1
  fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> exporting the state of $STAGE"
if ! npx sst state export --stage "$STAGE" > "$WORK/exported.json" 2>"$WORK/export.err"; then
  cat "$WORK/export.err" >&2
  echo "could not read the state — is '$STAGE' deployed? (npx sst state list)" >&2
  exit 1
fi

# What `sst state export` prints is `{ stack, latest }`, where `latest` is the deployment and
# `stack` is `<org>/<app>/<stage>`. `pulumi stack import` wants the checkpoint that wraps a
# deployment, so this is the translation between the two — and it keeps only the half a graph is
# made of: the URN, what owns it and what it waits for.
#
# Dropping `inputs`, `outputs` and `secrets_providers` is not tidiness. A real state carries
# ENCRYPTED values — the AuthSecret, and everything Pulumi marks secret for having touched it — and
# `stack import` re-encrypts them as it writes the snapshot, with the passphrase that state was
# sealed with. SST keeps that passphrase in SSM rather than in the state, so the import fails with
# `failed to encrypt: incorrect passphrase`. Importing no secret is what makes the passphrase
# irrelevant, and it is also why no secret of yours is ever written to the temp directory.
jq '(.latest // .deployment // .) as $d
    | { version: 3,
        deployment: {
          manifest: $d.manifest,
          resources: [
            $d.resources[]?
            | { urn, type, custom, id, parent, provider, dependencies, propertyDependencies }
            | with_entries(select(.value != null))
          ]
        } }' "$WORK/exported.json" \
  > "$WORK/state.json" || { echo "the exported state is not JSON" >&2; exit 1; }

# The app and the stage, off `stack` — which is there even when nothing is deployed, and is the same
# pair the URNs carry. An import into a stack the URNs do not name is refused, so if SST ever stops
# printing it, the first URN says the same thing: `urn:pulumi:<stage>::<app>::<type>::<name>`.
QUALIFIED="$(jq -r '.stack // empty' "$WORK/exported.json")"
URN="$(jq -r '.deployment.resources[0].urn // empty' "$WORK/state.json")"
if [ -n "$QUALIFIED" ]; then
  STACK="${QUALIFIED##*/}"
  APP="${QUALIFIED%/*}"; APP="${APP##*/}"
elif [ -n "$URN" ]; then
  STACK="${URN#urn:pulumi:}"; STACK="${STACK%%::*}"
  APP="${URN#*::}"; APP="${APP%%::*}"
else
  echo "the state of '$STAGE' names no stack — nothing to graph" >&2
  exit 1
fi

# A stage that has never been deployed, or one that `sst remove` emptied, still HAS a state: the
# manifest and the secrets provider, and no resources. There is nothing to draw, and it is worth
# saying which of the two it is rather than drawing an empty graph.
COUNT="$(jq '.deployment.resources | length // 0' "$WORK/state.json")"
if [ "$COUNT" = "0" ] || [ "$COUNT" = "null" ]; then
  echo "the state of '$STAGE' holds no resources — it is deployed nowhere, or it was removed." >&2
  echo "  the stages there are:   npx sst state list" >&2
  echo "  and to give it one:     npx sst deploy --stage $STAGE" >&2
  exit 1
fi

echo "==> $APP / $STACK — $COUNT resources"

# The throwaway: its own PULUMI_HOME and its own backend, so that whoever runs this keeps whatever
# `pulumi login` they already had. The passphrase is never used — nothing here decrypts a secret,
# and the graph is URNs, parents and dependencies — but unset is a prompt, and a prompt is a hang.
export PULUMI_HOME="$WORK/home"
export PULUMI_BACKEND_URL="file://$WORK"
export PULUMI_CONFIG_PASSPHRASE="${PULUMI_CONFIG_PASSPHRASE:-stack-graph}"
export PULUMI_SKIP_UPDATE_CHECK=true

cat > "$WORK/Pulumi.yaml" <<YAML
name: $APP
runtime: nodejs
description: a throwaway backend, so that pulumi stack graph has a stack to read
YAML

quietly pulumi --cwd "$WORK" stack init "$STACK" --non-interactive
quietly pulumi --cwd "$WORK" stack import --file "$WORK/state.json" --force --non-interactive

mkdir -p "$OUT_DIR"
quietly pulumi --cwd "$WORK" stack graph "$PWD/$DOT" \
  --disable-integrity-checking --non-interactive "$@"
echo "==> $DOT"

# `rankdir=LR` is the rendering's and not the graph's — the DOT stays exactly as Pulumi wrote it, to
# be re-rendered however anybody likes. Top-to-bottom, a stack this size lays out as a strip some
# twenty times wider than it is tall (52666x962 for 172 resources); left-to-right it is about 1:2.
if command -v dot >/dev/null; then
  dot -Grankdir=LR -T"$FORMAT" "$DOT" -o "$OUT_DIR/$STAGE.$FORMAT"
  echo "==> $OUT_DIR/$STAGE.$FORMAT"
else
  echo "    graphviz is not installed, so only the DOT was written — brew install graphviz"
fi
