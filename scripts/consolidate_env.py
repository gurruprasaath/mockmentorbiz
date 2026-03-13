from __future__ import annotations

import argparse
from pathlib import Path


PLACEHOLDER_VALUES = {
    "",
    "change-me",
    "changeme",
    "your-key-here",
    "your-api-key",
    "your_groq_key",
    "your_openai_key",
}


def _parse_env_lines(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        out[key] = value
    return out


def _is_placeholder(value: str) -> bool:
    v = (value or "").strip().strip("\"").strip("'").strip().lower()
    return v in PLACEHOLDER_VALUES or v.startswith("your-")


def _read_env_file(path: Path) -> tuple[list[str], dict[str, str]]:
    if not path.exists():
        return ([], {})
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    return (lines, _parse_env_lines(text))


def _write_env_file(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Consolidate env files into repo-root .env without printing secret values. "
            "By default this merges frontend/.env and backend/.env into .env."
        )
    )
    parser.add_argument("--repo", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument(
        "--delete-sources",
        action="store_true",
        help="Delete backend/.env and frontend/.env after merge.",
    )
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    root_env = repo / ".env"
    backend_env = repo / "backend" / ".env"
    frontend_env = repo / "frontend" / ".env"

    root_lines, root_kv = _read_env_file(root_env)
    backend_lines, backend_kv = _read_env_file(backend_env)
    frontend_lines, frontend_kv = _read_env_file(frontend_env)

    # Merge order: backend -> frontend (frontend wins if both define VITE_* etc.)
    merged = dict(backend_kv)
    merged.update(frontend_kv)

    # Update root kv in-memory
    changed_keys: list[str] = []
    for key, src_val in merged.items():
        if key not in root_kv:
            root_kv[key] = src_val
            changed_keys.append(key)
            continue

        existing_val = root_kv.get(key, "")
        if _is_placeholder(existing_val) and not _is_placeholder(src_val):
            root_kv[key] = src_val
            changed_keys.append(key)

    # Rebuild file content while preserving existing comments/structure as much as possible.
    existing_keys_in_file: set[str] = set()
    new_lines: list[str] = []

    for raw in root_lines:
        line = raw
        stripped = raw.strip()
        if stripped and not stripped.startswith("#"):
            work = stripped
            if work.startswith("export "):
                work = work[len("export ") :].lstrip()
            if "=" in work:
                k, _ = work.split("=", 1)
                k = k.strip()
                if k in root_kv:
                    existing_keys_in_file.add(k)
                    line = f"{k}={root_kv[k]}"
        new_lines.append(line)

    # Append any new keys that were not present in the root file
    missing = [k for k in root_kv.keys() if k not in existing_keys_in_file]
    if missing:
        new_lines.append("")
        new_lines.append("# Added by scripts/consolidate_env.py")
        for k in sorted(missing):
            new_lines.append(f"{k}={root_kv[k]}")

    _write_env_file(root_env, new_lines)

    print(f"Merged env into: {root_env}")
    if changed_keys:
        print(f"Updated {len(changed_keys)} existing keys (placeholders replaced).")

    if args.delete_sources:
        deleted: list[Path] = []
        for p in (backend_env, frontend_env):
            if p.exists():
                p.unlink()
                deleted.append(p)
        if deleted:
            print("Deleted source env files:")
            for p in deleted:
                print(f"- {p}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
