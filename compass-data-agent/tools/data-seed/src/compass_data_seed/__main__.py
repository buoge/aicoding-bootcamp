"Explicit command-line entry point; never falls back to application DATABASE_URL."

import argparse
import json
from pathlib import Path

from .contracts import validate_manifest
from .environment import publish, retry_failed, rollback
from .generator import generate


def main():
    parser = argparse.ArgumentParser(description="Compass synthetic retail data packages")
    commands = parser.add_subparsers(dest="command", required=True)
    gen = commands.add_parser("generate")
    gen.add_argument("--profile", choices=["fixture", "dev", "demo", "diagnostic"], required=True)
    gen.add_argument("--output", type=Path, required=True)
    gen.add_argument("--release", required=True)
    gen.add_argument("--seed", type=int, choices=[20261019, 20261117, 20261213])
    gen.add_argument("--catalog", type=Path)
    validate = commands.add_parser("validate")
    validate.add_argument("package", type=Path)
    validate.add_argument("--catalog", type=Path)
    for name in ("publish", "retry", "rollback"):
        command = commands.add_parser(name)
        command.add_argument("--config", type=Path, required=True)
        command.add_argument("--state", type=Path, required=True)
        if name == "rollback":
            command.add_argument("--release", required=True)
        else:
            command.add_argument("package", type=Path)
        if name != "retry":
            command.add_argument("--expected-active", default="none")
    schema_publish = commands.add_parser("publish-schema")
    schema_publish.add_argument("package", type=Path)
    schema_publish.add_argument("--config", type=Path, required=True)
    schema_publish.add_argument("--state", type=Path, required=True)
    export = commands.add_parser("export-sql")
    export.add_argument("package", type=Path)
    export.add_argument("--output", type=Path, required=True)
    export.add_argument("--schema", default="retail_course")
    export.add_argument("--catalog", type=Path)
    semantic = commands.add_parser("semantic-revise")
    semantic.add_argument("--catalog", type=Path, required=True)
    semantic.add_argument("--key", action="append", required=True)
    semantic.add_argument("--output", type=Path, required=True)
    semantic.add_argument("--response", type=Path)
    semantic.add_argument("--cache", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "export-sql":
            from .export_sql import export_sql

            result = export_sql(args.package, args.output, args.schema, catalog=args.catalog)
        elif args.command == "semantic-revise":
            from .semantic_workflow import revise_products

            result = revise_products(
                args.catalog, args.key, args.output, response_path=args.response, cache=args.cache
            )
        elif args.command == "generate":
            result = generate(
                args.profile, args.output, args.release, seed=args.seed, catalog=args.catalog
            )
        elif args.command == "validate":
            manifest = validate_manifest(args.package, catalog_root=args.catalog)
            result = {k: manifest[k] for k in ("release_id", "content_hash", "schema_version")}
            result["status"] = "file_integrity_passed; database gates required before publication"
        elif args.command == "publish-schema":
            from .schema_environment import publish_schema

            result = publish_schema(args.package, args.config, args.state)
        elif args.command == "publish":
            result = publish(
                args.package,
                args.config,
                args.state,
                expected_active=None if args.expected_active == "none" else args.expected_active,
            )
        elif args.command == "retry":
            retry_failed(args.package, args.config, args.state)
            result = {"status": "registered failed candidate removed; rerun publish"}
        else:
            result = rollback(
                args.release,
                args.config,
                args.state,
                None if args.expected_active == "none" else args.expected_active,
            )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, FileNotFoundError) as error:
        parser.exit(2, f"retail data: {error}\n")


if __name__ == "__main__":
    main()
