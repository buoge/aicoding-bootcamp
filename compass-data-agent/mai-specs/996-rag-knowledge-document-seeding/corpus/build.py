#!/usr/bin/env python3
"""Validate frozen authored documents and export a portable evidence corpus.

No model calls, vector service, database mutation, or reconstruction of business facts.
"""

import argparse
import copy
import csv
import hashlib
import json
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows))


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def safe_path(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Path escapes root: " + relative)
    return path


def source_validation(source_root, catalog, sources):
    manifest = read_json(source_root / "manifest.json")
    assert manifest["release_id"] == catalog["source_release_id"], "source release mismatch"
    assert manifest["content_hash"] == catalog["source_content_hash"], (
        "source content hash mismatch"
    )
    manifest_files = {f["relative_path"]: f for f in manifest["files"]}
    checked = {}
    for source in sources.values():
        assert source["indexable"] is False
        for f in source["files"]:
            rel = f["path"]
            registered = manifest_files[rel]
            allowed = registered["visibility"] == "public" or (
                registered["visibility"] == "metadata"
                and rel.startswith(
                    ("tables/ops.asset_period_status/", "tables/ops.source_watermark/")
                )
            )
            assert allowed, "unapproved source: " + rel
            assert f["sha256"] == registered["sha256"], "source registration mismatch"
            if rel not in checked:
                checked[rel] = digest(safe_path(source_root, rel).read_bytes())
            assert checked[rel] == f["sha256"], "source file changed: " + rel
        if source["kind"] == "records":
            by_file = {}
            for record in source["records"]:
                by_file.setdefault(record["file"], []).append(record)
            for rel, expected in by_file.items():
                selected = {r["csv_row_number"]: r for r in expected}
                with safe_path(source_root, rel).open() as stream:
                    for no, actual in enumerate(csv.DictReader(stream), 2):
                        if no not in selected:
                            continue
                        saved = selected.pop(no)
                        assert actual["tenant_id"] == "101", "source tenant mismatch"
                        assert all(actual[k] == v for k, v in saved["key"].items()), (
                            "source key mismatch"
                        )
                        assert all(actual[k] == v for k, v in saved["values"].items()), (
                            "source value mismatch"
                        )
                        row_hash = digest(
                            json.dumps(actual, sort_keys=True, ensure_ascii=False).encode()
                        )
                        assert row_hash == saved["row_sha256"], "source row digest mismatch"
                assert not selected, "source row missing"
        elif source["kind"] == "context_setting":
            obj = read_json(safe_path(source_root, source["files"][0]["path"]))
            for key in source["json_pointer"].strip("/").split("/"):
                obj = obj[key]
            assert obj == source["value"], "context setting mismatch"
        else:
            original = safe_path(source_root, source["files"][0]["path"]).read_text()
            assert (
                original[source["start_char"] : source["end_char"]].rstrip()
                == source["excerpt"].rstrip()
            ), "source excerpt mismatch"
    return {
        "files_verified": len(checked),
        "sources_verified": len(sources),
        "file_hashes": checked,
    }


def eligible(doc, knowledge_cutoff, business_time=None, usage="source_fact"):
    """Offline eligibility only; this is not an online authorization implementation."""
    known = doc["business_known_at"]
    if known is None:
        if usage != "current_reference":
            return False
        known = doc["authored_at"]
    cutoff = timestamp(knowledge_cutoff)
    if timestamp(known) > cutoff:
        return False
    if business_time:
        when = timestamp(business_time)
        if doc["valid_from"] and when < timestamp(doc["valid_from"]):
            return False
        if doc["valid_to"] and when >= timestamp(doc["valid_to"]):
            return False
    for event in doc["lifecycle_events"]:
        if timestamp(event["known_at"]) <= cutoff and event["type"] in ("revoked", "superseded"):
            effective = timestamp(event["effective_at"])
            if effective <= (timestamp(business_time) if business_time else cutoff):
                return False
    return True


def validate_content(catalog, sources, texts):
    docs = catalog["documents"]
    assert [d["document_id"] for d in docs] == [f"D{i:02}" for i in range(1, 24)], (
        "document roster mismatch"
    )
    assert sum(d["production_mode"] == "expanded" for d in docs) == 7
    assert len({d["family"] for d in docs}) == 12
    assert len({d["version_id"] for d in docs}) == 23
    for doc in docs:
        did = doc["document_id"]
        text = texts[did]
        assert digest(text.encode()) == doc["frozen_sha256"], "frozen document changed: " + did
        assert text.splitlines()[0] == "# " + doc["title"]
        assert len(text) > 500, "incomplete body: " + did
        assert not re.search(r"(?:并)?不是[^。\n]*而是", text), "prohibited contrast"
        assert not re.search(
            r"\bS(?:0[1-9]|1[0-2])\b|private_oracle|hidden_effect|生成器参数|测试答案", text
        ), "evaluation leak"
        assert doc["tenant_id"] == 101 and doc["access"]["tenant_id"] == 101, "tenant mismatch"
        assert doc["access"]["classification"] == "internal", "missing access restriction"
        assert doc["access"]["requires_cost_access"] is False
        assert doc["release_id"] == catalog["source_release_id"] and doc["profile"] == "diagnostic"
        assert doc["supports"] and doc["does_not_prove"] and doc["derived_from"]
        assert doc["origin_group"] and doc["source_ids"]
        headings = re.findall(r"^## (.+)$", text, re.M)
        assert headings == [s["heading"] for s in doc["sections"]], "section drift"
        if doc["valid_from"] and doc["valid_to"]:
            assert timestamp(doc["valid_from"]) < timestamp(doc["valid_to"]), (
                "invalid effective range"
            )
        for event in doc["lifecycle_events"]:
            assert event["type"] in ("revoked", "superseded", "corrected")
            assert event.get("target_version_id") == doc["version_id"], "lifecycle target mismatch"
            timestamp(event["known_at"])
            timestamp(event["effective_at"])
        source_times = []
        for sid in doc["source_ids"]:
            source = sources[sid]
            if source.get("available_at"):
                source_times.append(timestamp(source["available_at"]))
            for row in source.get("records", []):
                value = row["values"].get("available_at") or row["values"].get("observed_at")
                if value:
                    source_times.append(timestamp(value))
        if doc["business_known_at"] and source_times:
            assert timestamp(doc["business_known_at"]) >= max(source_times), (
                "future evidence leakage: " + did
            )
    for item in catalog["fact_assertions"]:
        assert item["quote"] in texts[item["document_id"]], "fact quote changed"
        values = sources[item["source_id"]]["records"]
        assert any(r["values"].get(item["field"]) == item["expected"] for r in values), (
            "fact value mismatch"
        )
    assert sources["stock-case-constraint"]["value"] == 50
    assert "50 件调出方保留量" in texts["D07"]
    groups = {d["document_id"]: d["origin_group"] for d in docs}
    assert len({groups[d] for d in ["D04", "D05", "D06"]}) == 1, "same-source chain split"
    return True


def build_citations(catalog, texts):
    citations, chunks = [], []
    for doc in catalog["documents"]:
        text = texts[doc["document_id"]]
        starts = list(re.finditer(r"^## .+$", text, re.M))
        for i, start in enumerate(starts):
            stop = starts[i + 1].start() if i + 1 < len(starts) else len(text)
            section = doc["sections"][i]
            section_text = text[start.start() : stop].rstrip()
            chunk_id = f"{doc['version_id']}:{section['section_id']}"
            shared = {
                "document_id": doc["document_id"],
                "version_id": doc["version_id"],
                "title": doc["title"],
                "source_path": doc["path"],
                "document_sha256": doc["frozen_sha256"],
                "section_id": section["section_id"],
                "section_heading": section["heading"],
                "tenant_id": 101,
                "release_id": doc["release_id"],
                "profile": doc["profile"],
                "business_known_at": doc["business_known_at"],
                "authored_at": doc["authored_at"],
                "historical_use": doc["historical_use"],
                "business_time_basis": doc["business_time_basis"],
                "valid_from": doc["valid_from"],
                "valid_to": doc["valid_to"],
                "lifecycle_events": doc["lifecycle_events"],
                "access": doc["access"],
                "origin_group": doc["origin_group"],
                "source_ids": section["source_ids"],
                "includes_simulated_procedure": section["includes_simulated_procedure"],
            }
            chunks.append(
                {
                    **shared,
                    "chunk_id": chunk_id,
                    "text": section_text,
                    "text_sha256": digest(section_text.encode()),
                    "start_char": start.start(),
                    "end_char": start.start() + len(section_text),
                }
            )
            body_start = text.find("\n", start.start()) + 1
            body = text[body_start:stop]
            for j, match in enumerate(re.finditer(r"\S[\s\S]*?(?=\n\s*\n|\Z)", body), 1):
                quote = match.group().rstrip()
                begin = body_start + match.start()
                citations.append(
                    {
                        **shared,
                        "citation_id": f"{chunk_id}:p{j:02}",
                        "paragraph_id": f"p{j:02}",
                        "quote": quote,
                        "quote_sha256": digest(quote.encode()),
                        "start_char": begin,
                        "end_char": begin + len(quote),
                        "line_start": text[:begin].count("\n") + 1,
                        "line_end": text[: begin + len(quote)].count("\n") + 1,
                        "context_chunk_id": chunk_id,
                        "offset_unit": "unicode_codepoint_half_open",
                    }
                )
    for c in citations:
        assert texts[c["document_id"]][c["start_char"] : c["end_char"]] == c["quote"], (
            "quote locator mismatch"
        )
    return citations, chunks


def resolve_cases(cases, citations):
    resolved = []
    for case in cases:
        result = copy.deepcopy(case)
        for ref in result["evidence"]:
            matches = [
                c
                for c in citations
                if c["document_id"] == ref["document_id"] and ref["quote"] in c["quote"]
            ]
            assert len(matches) == 1, (case["case_id"], ref, len(matches))
            c = matches[0]
            ref.update(
                {
                    "citation_id": c["citation_id"],
                    "source_path": c["source_path"],
                    "line_start": c["line_start"],
                    "source_ids": c["source_ids"],
                    "origin_group": c["origin_group"],
                }
            )
        assert (
            result["expected_behavior"]
            and result["forbidden_inferences"]
            and result["structured_checks"]
        )
        resolved.append(result)
    assert {s for c in resolved for s in c["story_ids"]} == {f"S{i:02}" for i in range(1, 13)}
    return resolved


def inspect_case_data(source_root, catalog):
    """Small factual observations for the teaching demo, separate from indexable text."""
    manifest = read_json(source_root / "manifest.json")
    registered = {f["relative_path"]: f for f in manifest["files"]}
    read_files = {}

    def records(table, month):
        rel = f"tables/{table}/{month}.csv"
        path = safe_path(source_root, rel)
        assert registered[rel]["visibility"] == "public"
        actual_hash = digest(path.read_bytes())
        assert actual_hash == registered[rel]["sha256"], "case source changed"
        read_files[rel] = actual_hash
        with path.open() as stream:
            for row in csv.DictReader(stream):
                if row["tenant_id"] == "101":
                    yield row

    counts = {}
    seen = set()
    for row in records("core.experiment_assignment", "2025-09"):
        key = (row["experiment_id"], row["unit_id"])
        assert key not in seen, "duplicate randomized unit"
        seen.add(key)
        experiment = counts.setdefault(row["experiment_id"], {})
        experiment[row["variant"]] = experiment.get(row["variant"], 0) + 1
    orders = {r["order_id"]: r["channel_id"] for r in records("core.order_header", "2025-11")}
    attempts = []
    begin = timestamp("2025-11-10T10:00:00+08:00")
    end = timestamp("2025-11-10T11:30:00+08:00")
    for row in records("core.payment", "2025-11"):
        if orders.get(row["order_id"]) == "4" and begin <= timestamp(row["attempted_at"]) < end:
            attempts.append(row)
    minutes = {}
    for row in attempts:
        key = timestamp(row["attempted_at"]).strftime("%Y-%m-%dT%H:%MZ")
        count = minutes.setdefault(key, {"attempts": 0, "succeeded": 0})
        count["attempts"] += 1
        count["succeeded"] += row["status"] == "SUCCEEDED"
    result = {
        "source_release_id": catalog["source_release_id"],
        "source_files": read_files,
        "experiment_assignment_counts": counts,
        "payment_window": {
            "channel_id": 4,
            "start": "2025-11-10T10:00:00+08:00",
            "end_exclusive": "2025-11-10T11:30:00+08:00",
            "attempts": len(attempts),
            "minutes_utc": minutes,
            "minimum_per_minute": 100,
            "all_observed_minutes_below_minimum": all(
                r["attempts"] < 100 for r in minutes.values()
            ),
        },
        "scope": "只验证分配人数和指定支付窗口的事实；未运行完整实验效果、全部故事分析或向量检索",
    }
    return result


def negative_checks(catalog, sources, texts):
    results = []

    def reject(name, mutate):
        c, s, t = copy.deepcopy(catalog), copy.deepcopy(sources), dict(texts)
        mutate(c, s, t)
        try:
            validate_content(c, s, t)
        except (AssertionError, KeyError, ValueError):
            results.append({"name": name, "passed": True})
        else:
            raise AssertionError("negative case not rejected: " + name)

    def edit_text(c, t, did, old, new):
        t[did] = t[did].replace(old, new)
        next(d for d in c["documents"] if d["document_id"] == did)["frozen_sha256"] = digest(
            t[did].encode()
        )

    reject(
        "wrong_receipt_quantity_even_with_new_hash",
        lambda c, s, t: edit_text(c, t, "D06", "400", "401"),
    )
    reject(
        "wrong_procurement_due_date",
        lambda c, s, t: edit_text(c, t, "D04", "2025-09-06 00:00", "2025-09-07 00:00"),
    )
    reject("wrong_price", lambda c, s, t: edit_text(c, t, "D10", "559.00", "599.00"))
    reject("wrong_store_operating_minutes", lambda c, s, t: edit_text(c, t, "D12", "660", "720"))
    reject("wrong_tenant", lambda c, s, t: c["documents"][4].update(tenant_id=102))
    reject("missing_access_scope", lambda c, s, t: c["documents"][4]["access"].pop("tenant_id"))
    reject(
        "recovery_backdated_to_oms_notice",
        lambda c, s, t: c["documents"][14].update(business_known_at="2025-09-30T21:00:00+08:00"),
    )
    reject("wrong_source_release", lambda c, s, t: c["documents"][4].update(release_id="other"))
    reject("document_id_roster_loss", lambda c, s, t: c["documents"].pop())
    reject(
        "same_source_misrepresented",
        lambda c, s, t: c["documents"][5].update(origin_group="independent_supplier_interview"),
    )
    reject(
        "invalid_validity_range",
        lambda c, s, t: c["documents"][0].update(
            valid_from="2025-02-01T00:00:00+08:00", valid_to="2025-01-01T00:00:00+08:00"
        ),
    )
    doc = copy.deepcopy(catalog["documents"][4])
    assert not eligible(doc, "2025-09-03T23:59:59+08:00")
    assert eligible(doc, "2025-09-04T00:15:00+08:00")
    doc["lifecycle_events"] = [
        {
            "type": "revoked",
            "target_version_id": doc["version_id"],
            "known_at": "2025-09-07T00:00:00+08:00",
            "effective_at": "2025-09-06T00:00:00+08:00",
        }
    ]
    assert eligible(doc, "2025-09-06T12:00:00+08:00")
    assert not eligible(doc, "2025-09-07T00:00:00+08:00")
    assert eligible(doc, "2025-09-07T00:00:00+08:00", "2025-09-05T00:00:00+08:00")
    assert not eligible(catalog["documents"][2], "2025-12-15T09:00:00+08:00")
    assert not eligible(catalog["documents"][0], "2025-12-15T09:00:00+08:00")
    results.append({"name": "historical_version_and_revocation_time_boundaries", "passed": True})
    return results


def export_package(output, catalog, sources, texts, citations, chunks, cases, report, observations):
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="corpus-", dir=output.parent) as temp:
        stage = Path(temp) / "package"
        stage.mkdir()
        (stage / "documents").mkdir()
        (stage / "validation").mkdir()
        (stage / "sources").mkdir()
        for doc in catalog["documents"]:
            (stage / doc["path"]).write_text(texts[doc["document_id"]])
        write_json(stage / "catalog.json", catalog)
        write_json(stage / "sources" / "evidence.json", sources)
        write_jsonl(stage / "citations.jsonl", citations)
        # Only document sections are indexable; case questions / expected behavior stay separate.
        write_jsonl(stage / "chunks.jsonl", chunks)
        write_json(stage / "validation" / "cases.json", cases)
        write_json(stage / "validation" / "report.json", report)
        write_json(stage / "validation" / "observations.json", observations)
        readme = (
            (HERE / "README.md")
            .read_text()
            .replace(
                "本目录为冻结正文及生产配置的唯一维护源。",
                "本目录为派生交付快照；唯一维护源位于 Compass 的 "
                "mai-specs/996-rag-knowledge-document-seeding/corpus/。",
            )
        )
        (stage / "README.md").write_text(readme)
        demo = [
            "# 文档证据演示清单",
            "",
            "本清单及核验结果仅用于备课和验收，不进入向量索引。正文中的业务事实保持独立。",
            "",
        ]
        for case in cases:
            demo += [
                "## " + case["case_id"] + " · " + case["question"],
                "",
                case["expected_behavior"],
                "",
            ]
            for ref in case["evidence"]:
                demo += [
                    f"- [{ref['document_id']}](../{ref['source_path']})："
                    f"{ref['citation_id']}，第 {ref['line_start']} 行。",
                    "  > " + ref["quote"],
                ]
            demo += [
                "",
                "结构化核对：" + "；".join(case["structured_checks"]),
                "",
                "禁止推断：" + "；".join(case["forbidden_inferences"]),
                "",
            ]
        demo += [
            "## 已执行的源数据观察",
            "",
            "下列数值直接读取并核验源 CSV 摘要，保留在验证目录，不写入事前预案。"
            "完整分析仍按各案例的结构化核对步骤执行。",
            "",
            "| 实验 | A 组分配人数 | B 组分配人数 |",
            "|---|---:|---:|",
        ]
        for eid, counts in sorted(observations["experiment_assignment_counts"].items()):
            demo.append(f"| EXP{eid} | {counts.get('A', 0)} | {counts.get('B', 0)} |")
        demo += [
            "",
            f"指定 90 分钟小程序支付窗口共 {observations['payment_window']['attempts']} 次尝试；"
            "各已观察分钟均低于 100 次条件："
            f"{observations['payment_window']['all_observed_minutes_below_minimum']}。",
            "",
            "完整原始文件摘要和观测范围见 [observations.json](observations.json)。",
            "",
        ]
        (stage / "validation" / "DEMO.md").write_text("\n".join(demo) + "\n")
        assets = []
        for p in sorted(stage.rglob("*")):
            if p.is_file():
                rel = p.relative_to(stage).as_posix()
                assets.append(
                    {
                        "path": rel,
                        "sha256": digest(p.read_bytes()),
                        "bytes": p.stat().st_size,
                        "indexable": rel.startswith("documents/") or rel == "chunks.jsonl",
                    }
                )
        logical = {"release_id": catalog["release_id"], "files": assets}
        logical_hash = digest(json.dumps(logical, sort_keys=True, ensure_ascii=False).encode())
        manifest = {
            "release_id": catalog["release_id"],
            "source_release_id": catalog["source_release_id"],
            "source_content_hash": catalog["source_content_hash"],
            "logical_sha256": logical_hash,
            "documents": 23,
            "versions": 23,
            "chunks": len(chunks),
            "citations": len(citations),
            "content_validation": "passed",
            "vector_integration": "not_executed",
            "index_entrypoint": "chunks.jsonl",
            "files": assets,
        }
        write_json(stage / "manifest.json", manifest)
        if output.exists():
            old = read_json(output / "manifest.json")
            assert old["logical_sha256"] == logical_hash, (
                "refuse to overwrite different frozen release"
            )
            for f in old["files"]:
                assert digest(safe_path(output, f["path"]).read_bytes()) == f["sha256"], (
                    "existing output altered"
                )
        else:
            shutil.move(str(stage), str(output))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    catalog = read_json(HERE / "catalog.json")
    sources = read_json(HERE / "sources.json")
    texts = {d["document_id"]: safe_path(HERE, d["path"]).read_text() for d in catalog["documents"]}
    verification = source_validation(args.source, catalog, sources)
    validate_content(catalog, sources, texts)
    citations, chunks = build_citations(catalog, texts)
    cases = resolve_cases(read_json(HERE / "cases.json"), citations)
    negatives = negative_checks(catalog, sources, texts)
    observations = inspect_case_data(args.source, catalog)
    report = {
        "content_validation": "passed",
        "vector_integration": "not_executed",
        "source_verification": verification,
        "document_count": 23,
        "expanded": 7,
        "new": 16,
        "family_count": 12,
        "case_count": len(cases),
        "story_count": 12,
        "citation_count": len(citations),
        "chunk_count": len(chunks),
        "field_assertions": len(catalog["fact_assertions"]),
        "negative_checks": negatives,
        "reference_only_documents": [
            d["document_id"] for d in catalog["documents"] if d["business_known_at"] is None
        ],
        "limits": [
            "未运行 embedding、向量召回、在线授权或完整 Agent 链路",
            "正文为合成资料；未知历史签发时间保留未知，新增程序为显式模拟设定",
            "源记录核验与原句定位通过不等于因果结论成立",
        ],
    }
    if args.output:
        manifest = export_package(
            args.output, catalog, sources, texts, citations, chunks, cases, report, observations
        )
        report["logical_sha256"] = manifest["logical_sha256"]
    report.pop("source_verification")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
