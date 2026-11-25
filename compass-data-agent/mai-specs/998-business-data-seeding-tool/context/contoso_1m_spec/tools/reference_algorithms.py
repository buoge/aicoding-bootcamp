#!/usr/bin/env python3
"""协议参考实现；不是 Contoso fork 或电商领域生成器。

只依赖 Python 标准库。读取补丁契约中的已知答案和小型 fixture，验证
SHA-256 命名均匀数、固定 binary64 CDF、整数最大余数分摊及日期配额。
百万配额验证只产生 3,288 个日期桶，不产生订单记录；未执行 C# 代码。

实际可执行命令：python tools/reference_algorithms.py
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
from typing import Iterable, Sequence


VERSION = "sha256_named_uniform52_v1"
SAFE_IDENTIFIER = re.compile(r"[A-Za-z0-9_.:/-]+\Z")
SIGNED_DECIMAL = re.compile(r"(?:0|[1-9][0-9]*|-[1-9][0-9]*)\Z")
NONNEGATIVE_DECIMAL = re.compile(r"(?:0|[1-9][0-9]*)\Z")
POSITIVE_DECIMAL = re.compile(r"[1-9][0-9]*\Z")


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def named_uniform52(key: Sequence[str]) -> dict:
    """无状态命名抽样；完整 7 字段键决定一次抽样，不截为 32 位 seed。"""
    if len(key) != 7 or any(not isinstance(field, str) for field in key):
        raise ValueError("random key must contain exactly seven strings")
    if key[0] != VERSION:
        raise ValueError("unsupported random protocol")
    if any(not SAFE_IDENTIFIER.fullmatch(key[i]) for i in (0, 3, 4, 5)):
        raise ValueError("identifier contains non-protocol characters")
    if not SIGNED_DECIMAL.fullmatch(key[1]):
        raise ValueError("seed must be a canonical signed decimal string")
    if not POSITIVE_DECIMAL.fullmatch(key[2]):
        raise ValueError("tenant must be a canonical positive decimal string")
    if not NONNEGATIVE_DECIMAL.fullmatch(key[6]):
        raise ValueError("counter must be a canonical nonnegative decimal string")
    encoded = canonical_json_bytes(list(key))
    digest = hashlib.sha256(encoded).digest()
    k52 = int.from_bytes(digest[:8], byteorder="big") >> 12
    uniform = (k52 + 0.5) * (2.0 ** -52)
    if not 0.0 < uniform < 1.0:
        raise AssertionError("uniform must lie strictly between zero and one")
    return {
        "key_utf8": encoded.decode("utf-8"),
        "sha256": digest.hex(),
        "k52": k52,
        "uniform_float64_hex": uniform.hex(),
        "uniform_ieee754_binary64_hex": struct.pack(">d", uniform).hex(),
    }


def weighted_cdf(candidates: Iterable[tuple[int, float]], uniform: float) -> int:
    """按数值 ID 排序、左到右 double 累计、严格上界的固定 CDF。"""
    if not math.isfinite(uniform) or not 0.0 < uniform < 1.0:
        raise ValueError("uniform must be finite and strictly within (0,1)")
    materialized = list(candidates)
    if not materialized:
        raise ValueError("empty candidates")
    ids = [candidate_id for candidate_id, _ in materialized]
    if any(type(candidate_id) is not int for candidate_id in ids):
        raise ValueError("candidate IDs must be stable integers")
    if len(set(ids)) != len(ids):
        raise ValueError("candidate IDs must be unique")
    ordered = []
    total = 0.0
    for candidate_id, raw_weight in sorted(materialized):
        weight = float(raw_weight)
        if not math.isfinite(weight) or weight < 0.0:
            raise ValueError("weights must be finite and nonnegative")
        if weight == 0.0:
            continue
        ordered.append((candidate_id, weight))
        total = total + weight  # 固定顺序；不能改成并行归约或 math.fsum。
    if not math.isfinite(total) or total <= 0.0:
        raise ValueError("positive weight sum must be finite")
    threshold = min(uniform * total, math.nextafter(total, -math.inf))
    cumulative = 0.0
    for candidate_id, weight in ordered:
        cumulative = cumulative + weight
        if cumulative > threshold:
            return candidate_id
    raise AssertionError("CDF exhausted despite a valid clamped threshold")


def integer_weights_from_float64(weights: Sequence[float]) -> list[int]:
    """精确保留冻结 binary64 权重比值，不自选十进制舍入精度。"""
    if not weights:
        raise ValueError("empty weights")
    ratios = []
    for value in weights:
        value = float(value)
        if not math.isfinite(value) or value < 0.0:
            raise ValueError("weights must be finite and nonnegative")
        ratios.append(value.as_integer_ratio())
    # float64 分母都是 2 的幂；最大分母即所有分母的最小公倍数。
    denominator = max(denom for _, denom in ratios)
    integers = [numerator * (denominator // denom)
                for numerator, denom in ratios]
    common = math.gcd(*integers)
    return [value // common for value in integers] if common else integers


def largest_remainder(total: int, weights: Sequence[int],
                      stable_keys: Sequence[int | str]) -> list[int]:
    """整数守恒分摊；相同余数按可比较的稳定键升序分配。"""
    if type(total) is not int or total < 0:
        raise ValueError("total must be a nonnegative integer")
    if not weights or len(weights) != len(stable_keys):
        raise ValueError("weights and stable keys must have equal positive length")
    if any(type(weight) is not int or weight < 0 for weight in weights):
        raise ValueError("weights must be nonnegative integers")
    if len(set(stable_keys)) != len(stable_keys):
        raise ValueError("stable keys must be unique")
    denominator = sum(weights)
    if denominator == 0:
        if total == 0:
            return [0] * len(weights)
        raise ValueError("positive total cannot be allocated with all-zero weights")
    quotients_and_remainders = [divmod(total * weight, denominator)
                               for weight in weights]
    allocation = [quotient for quotient, _ in quotients_and_remainders]
    remaining = total - sum(allocation)
    ranking = sorted(range(len(weights)), key=lambda i: (
        -quotients_and_remainders[i][1], stable_keys[i]))
    for index in ranking[:remaining]:
        allocation[index] += 1
    if sum(allocation) != total:
        raise AssertionError("allocation does not conserve the integer total")
    return allocation


def sunday_first(iso_weekday_weights: Sequence[int | float]) -> list:
    """profile 周一首位 → Contoso WeekDaysFactor 周日首位。"""
    if len(iso_weekday_weights) != 7:
        raise ValueError("weekday weights must have seven entries")
    return [iso_weekday_weights[6], *iso_weekday_weights[:6]]


def require_equal(actual: object, expected: object) -> None:
    if actual != expected:
        raise AssertionError(f"actual={actual!r}; expected={expected!r}")


def expect_value_error(function, *args) -> None:
    try:
        function(*args)
    except ValueError:
        return
    raise AssertionError("invalid input was accepted")


def verify(contract_path: Path) -> dict:
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    root = contract_path.parent.parent
    fixtures = contract["reference_fixtures"]
    checks = []

    def check(name: str, operation) -> None:
        try:
            evidence = operation()
            checks.append({"name": name, "status": "PASS", "evidence": evidence})
        except Exception as exc:
            checks.append({"name": name, "status": "FAIL",
                           "error": f"{type(exc).__name__}: {exc}"})

    def verify_input_hashes() -> dict:
        results = {}
        for key in ("canonical_schema", "production_profile"):
            source = contract[key]
            actual = sha256_file(root / source["path"])
            require_equal(actual, source["observed_sha256"])
            results[source["path"]] = actual
        return results

    check("input_schema_and_profile_hashes", verify_input_hashes)

    for index, vector in enumerate(contract["random_spec"]["known_answer_vectors"], 1):
        def verify_vector(vector=vector):
            actual = named_uniform52(vector["key"])
            for field in ("sha256", "k52", "uniform_float64_hex",
                          "uniform_ieee754_binary64_hex"):
                require_equal(actual[field], vector[field])
            return actual
        check(f"named_uniform52_vector_{index}", verify_vector)

    for fixture in fixtures["cdf"]:
        def verify_cdf(fixture=fixture):
            candidates = [(key, float.fromhex(value))
                          for key, value in fixture["candidates"]]
            selected = weighted_cdf(candidates, float.fromhex(fixture["u_hex"]))
            require_equal(selected, fixture["expected_id"])
            return {"selected_id": selected}
        check(f"cdf_{fixture['name']}", verify_cdf)

    def verify_rejected_inputs() -> dict:
        cases = [
            ("overflow_sum", [(1, 1e308), (2, 1e308)], 0.5),
            ("all_zero", [(1, 0.0)], 0.5),
            ("negative_weight", [(1, -1.0)], 0.5),
            ("nan_weight", [(1, math.nan)], 0.5),
            ("duplicate_id", [(1, 1.0), (1, 1.0)], 0.5),
            ("zero_uniform", [(1, 1.0)], 0.0),
            ("one_uniform", [(1, 1.0)], 1.0),
        ]
        for _, candidates, uniform in cases:
            expect_value_error(weighted_cdf, candidates, uniform)
        return {"rejected_cases": [name for name, _, _ in cases]}
    check("cdf_rejects_invalid_inputs", verify_rejected_inputs)

    for fixture in fixtures["money_net_amounts"]:
        def verify_money(fixture=fixture):
            actual = largest_remainder(fixture["total"], fixture["weights"],
                                       fixture["stable_keys"])
            require_equal(actual, fixture["expected"])
            return {"total_cent": fixture["total"], "net_unit_cents": actual,
                    "sum_cent": sum(actual)}
        check(f"integer_money_{fixture['name']}", verify_money)

    def verify_exact_ratios() -> dict:
        values = [0.1, 0.2, 0.3]
        converted = integer_weights_from_float64(values)
        for i in range(len(values)):
            ni, di = values[i].as_integer_ratio()
            for j in range(len(values)):
                nj, dj = values[j].as_integer_ratio()
                require_equal(converted[i] * nj * di,
                              converted[j] * ni * dj)
        allocation = largest_remainder(1_000_000, converted, [1, 2, 3])
        require_equal(sum(allocation), 1_000_000)
        return {"source_float64_hex": [value.hex() for value in values],
                "exact_integer_weights": converted, "allocation": allocation}
    check("float64_weights_preserve_exact_ratios", verify_exact_ratios)

    def verify_edge_allocations() -> dict:
        require_equal(largest_remainder(0, [0, 0], [1, 2]), [0, 0])
        require_equal(largest_remainder(1, [1, 1], [2, 1]), [0, 1])
        require_equal(largest_remainder(5, [0, 2], [1, 2]), [0, 5])
        expect_value_error(largest_remainder, 1, [0, 0], [1, 2])
        return {"zero_total": "PASS", "stable_key_tie": "PASS",
                "zero_weight_gets_no_allocation": "PASS",
                "positive_total_zero_weight_rejected": "PASS"}
    check("largest_remainder_boundaries", verify_edge_allocations)

    def verify_weekdays() -> dict:
        fixture = fixtures["weekday_projection"]
        result = sunday_first(fixture["iso"])
        require_equal(result, fixture["expected_sunday_first"])
        # 2023-01-01 是 Sunday；2023-01-02 是 Monday，验证日期索引也一致。
        for business_date in (date(2023, 1, 1), date(2023, 1, 2)):
            require_equal(result[(business_date.weekday() + 1) % 7],
                          fixture["iso"][business_date.weekday()])
        return {"iso_monday_first": fixture["iso"],
                "contoso_sunday_first": result}
    check("iso_to_contoso_weekday_projection", verify_weekdays)

    def verify_calendar_quotas() -> dict:
        fixture = fixtures["calendar_quota"]
        current = date.fromisoformat(fixture["order_start_inclusive"])
        end = date.fromisoformat(fixture["order_end_exclusive"])
        dates, weights = [], []
        while current < end:
            dates.append(current.isoformat())
            weights.append(fixture["annual_weight_int"][str(current.year)]
                           * fixture["monthly_weight_int"][current.month - 1]
                           * fixture["weekday_weight_iso_int"][current.weekday()])
            current += timedelta(days=1)
        require_equal(len(dates), fixture["expected_order_days"])
        require_equal("2024-02-29" in dates, True)
        require_equal(fixture["tenant_quotas"],
                      contract["production_invariants"]["tenant_quotas"])
        summaries, records = [], []
        for tenant, quota in sorted(fixture["tenant_quotas"].items(),
                                    key=lambda pair: int(pair[0])):
            allocation = largest_remainder(quota, weights, dates)
            require_equal(sum(allocation), quota)
            summaries.append({"tenant_id": int(tenant), "quota": quota,
                              "actual_slot_sum": sum(allocation),
                              "date_buckets": len(allocation),
                              "minimum_daily_slots": min(allocation),
                              "maximum_daily_slots": max(allocation)})
            records.extend([int(tenant), day, count]
                           for day, count in zip(dates, allocation))
        actual_total = sum(row["actual_slot_sum"] for row in summaries)
        require_equal(actual_total, fixture["expected_total"])
        require_equal(len(records), fixture["expected_date_buckets"])
        return {"scope": fixtures["scope"], "tenants": summaries,
                "actual_slot_sum": actual_total, "date_buckets": len(records),
                "order_records_created": 0,
                "sorted_date_quota_fixture_sha256": hashlib.sha256(
                    canonical_json_bytes(records)).hexdigest()}
    check("one_million_exact_date_slot_quotas", verify_calendar_quotas)

    passed = sum(row["status"] == "PASS" for row in checks)
    return {
        "report_type": "PROTOCOL_REFERENCE_ONLY",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if passed == len(checks) else "FAIL",
        "checks_total": len(checks), "checks_passed": passed,
        "checks_failed": len(checks) - passed,
        "input_contract_sha256": sha256_file(contract_path),
        "reference_script_sha256": sha256_file(Path(__file__)),
        "python_version": sys.version.split()[0],
        "cross_language_execution_performed": False,
        "contoso_fork_executed": False,
        "domain_generator_executed": False,
        "order_records_created": 0,
        "checks": checks,
    }


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path,
                        default=root / "config/contoso_patch_contract.json")
    parser.add_argument("--report", type=Path,
                        default=root / "validation/reference_algorithms_report.json")
    args = parser.parse_args()
    try:
        report = verify(args.contract.resolve())
    except Exception as exc:
        report = {"report_type": "PROTOCOL_REFERENCE_ONLY", "status": "FAIL",
                  "fatal_error": f"{type(exc).__name__}: {exc}",
                  "order_records_created": 0}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2,
                                     allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"],
                      "checks_passed": report.get("checks_passed", 0),
                      "checks_total": report.get("checks_total", 0),
                      "order_records_created": 0,
                      "report": str(args.report)}, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
