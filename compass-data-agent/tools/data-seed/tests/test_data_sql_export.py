"""Portable export contract: immutable package, ordinary SQL, atomic collision refusal."""

import pytest
from compass_data_seed.contracts import file_hash
from compass_data_seed.export_sql import export_sql, literal
from compass_data_seed.generator import generate


def test_standalone_sql_is_reproducible_and_contains_public_assets(tmp_path):
    root = tmp_path / "fixture"
    generate("fixture", root, "portable-fixture")
    first, second = tmp_path / "a.sql", tmp_path / "b.sql"
    a = export_sql(root, first)
    b = export_sql(root, second)
    assert a["sha256"] == b["sha256"] == file_hash(first)
    content = first.read_text()
    assert 'CREATE SCHEMA "retail_course";' in content
    assert 'CREATE TABLE "retail_course".course_asset' in content
    assert "manifest.json" in content and "source-delay.md" in content
    assert "COPY " not in content and "CREATE ROLE " not in content
    assert "\\copy " not in content and "\\i " not in content
    assert "INSERT INTO" in content and "COMMIT;" in content
    assert "customer-traits-101.json" not in content and "fixture-map.json" not in content
    with pytest.raises(ValueError, match="already exists"):
        export_sql(root, first)
    assert file_hash(first) == a["sha256"]


def test_literal_keeps_text_as_data():
    assert literal(None) == "NULL"
    assert literal("O'Brien; DROP TABLE x;") == "'O''Brien; DROP TABLE x;'"
    assert literal("a\\b\n中文") == "'a\\b\n中文'"
