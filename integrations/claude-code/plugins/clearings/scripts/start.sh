#!/bin/sh
# Installed users need only the native executable and ordinary OS utilities.
set -eu
umask 077
clearings_plugin=$(CDPATH= cd -- "${0%/*}/.." && pwd -P)
if [ -x "$clearings_plugin/bin/clearings" ]; then
    exec "$clearings_plugin/bin/clearings" plugin-mcp --all-projects "$@"
fi

IFS= read -r clearings_version < "$clearings_plugin/runtime-version"
case "$clearings_version" in
    v[0-9]* ) ;;
    * ) printf '%s\n' 'Invalid Clearings runtime version.' >&2; exit 1 ;;
esac
case "$clearings_version" in *[!a-zA-Z0-9.-]* ) exit 1 ;; esac
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)
        clearings_target=x86_64-unknown-linux-gnu
        clearings_cache_base=${XDG_CACHE_HOME:-"${HOME:?}/.cache"}/clearings
        ;;
    Darwin-arm64)
        clearings_target=aarch64-apple-darwin
        clearings_cache_base=${HOME:?}/Library/Caches/Clearings
        ;;
    *) printf '%s\n' 'Clearings supports Linux x86-64 and macOS Apple silicon.' >&2; exit 1 ;;
esac
case "$clearings_cache_base" in /* ) ;; * ) printf '%s\n' 'Clearings cache path must be absolute.' >&2; exit 1 ;; esac
mkdir -p "$clearings_cache_base"
[ ! -L "$clearings_cache_base" ] || exit 1
case "$clearings_target" in
    *linux*) clearings_owner=$(stat -c '%u:%a' "$clearings_cache_base") ;;
    *) clearings_owner=$(stat -f '%u:%Lp' "$clearings_cache_base") ;;
esac
if [ "$clearings_owner" != "$(id -u):700" ]; then
    printf '%s\n' 'Clearings cache directory must be owned by you with permissions 0700.' >&2
    exit 1
fi
clearings_destination=$clearings_cache_base/$clearings_version-$clearings_target
if [ -x "$clearings_destination/clearings" ]; then
    exec "$clearings_destination/clearings" plugin-mcp --all-projects "$@"
fi

# Concurrent clients may download independently. Each publishes a complete,
# uniquely named directory through one atomic symlink; no partial binary runs.
clearings_download=$(mktemp -d "$clearings_cache_base/download.XXXXXXXX")
trap 'rm -rf "$clearings_download"' EXIT HUP INT TERM
clearings_asset=clearings-$clearings_version-$clearings_target.tar.gz
clearings_url=https://github.com/jiaxing-guo/clearings/releases/download/$clearings_version
printf 'Downloading Clearings %s for %s…\n' "$clearings_version" "$clearings_target" >&2
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 120 "$clearings_url/$clearings_asset" -o "$clearings_download/$clearings_asset"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 30 "$clearings_url/SHA256SUMS" -o "$clearings_download/SHA256SUMS"
awk -v asset="$clearings_asset" '$2 == asset && length($1) == 64 && $1 !~ /[^0-9a-f]/ {print; found++} END {if (found != 1) exit 1}' "$clearings_download/SHA256SUMS" > "$clearings_download/checksum"
(
    cd "$clearings_download"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -c checksum >&2
    else
        shasum -a 256 -c checksum >&2
    fi
    tar -xzf "$clearings_asset"
)
[ -x "$clearings_download/clearings/clearings" ]
clearings_ready=$(mktemp -d "$clearings_cache_base/runtime.XXXXXXXX")
mv "$clearings_download/clearings" "$clearings_ready/package"
mkdir -p "$clearings_destination"
if ! ln -s "$clearings_ready/package/clearings" "$clearings_destination/clearings" 2>/dev/null; then
    rm -rf "$clearings_ready"
    [ -x "$clearings_destination/clearings" ]
fi
rm -rf "$clearings_download"
trap - EXIT HUP INT TERM
exec "$clearings_destination/clearings" plugin-mcp --all-projects "$@"
