"""Validate internal dependency graph parity and app import boundaries."""

import ast
import json
import tomllib
from pathlib import Path

root = Path(__file__).resolve().parents[1]
workspace = tomllib.loads((root / "pyproject.toml").read_text())
members = [root / p for p in workspace["tool"]["uv"]["workspace"]["members"]]
projects = {
    tomllib.loads((p / "pyproject.toml").read_text())["project"]["name"]: p for p in members
}
node_names = {
    name: json.loads((p / "package.json").read_text())["name"] for name, p in projects.items()
}
app_modules = {
    p.name: [s.name for s in (p / "src").iterdir() if s.is_dir()]
    for p in members
    if p.parent.name == "apps"
}
for name, p in projects.items():
    config = tomllib.loads((p / "pyproject.toml").read_text())
    sources = config.get("tool", {}).get("uv", {}).get("sources", {})
    expected = {node_names[n] for n, v in sources.items() if v.get("workspace")}
    node = json.loads((p / "package.json").read_text())
    actual = {n for n, v in node.get("dependencies", {}).items() if v.startswith("workspace:")}
    assert actual == expected, f"Dependency graph mismatch: {name}: {actual} != {expected}"
    for file in (p / "src").rglob("*.py"):
        for item in ast.walk(ast.parse(file.read_text())):
            imports = (
                [a.name for a in item.names]
                if isinstance(item, ast.Import)
                else [item.module or ""]
                if isinstance(item, ast.ImportFrom)
                else []
            )
            for module in imports:
                for app, modules in app_modules.items():
                    assert p.name == app or module.split(".")[0] not in modules, (
                        f"Cross-app import: {file}: {module}"
                    )
print("Workspace dependency graphs and Python app boundaries match.")
