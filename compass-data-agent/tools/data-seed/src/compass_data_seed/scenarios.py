"""Public scenario evidence and separately held oracle artifacts."""

import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from .contracts import file_hash
from .storage import DAY, START, day_start, local_date, stamp


def read_rows(root, table):
    for path in sorted((root / "tables" / table).glob("*.csv")):
        with path.open(newline="") as stream:
            yield from csv.DictReader(stream)


def build_scenarios(root: Path, private: Path, profile, simulations):
    files = []
    public = root / "scenarios"
    public.mkdir(exist_ok=True)
    private.mkdir(mode=0o700, exist_ok=True)

    def write(name, columns, rows, private_file=False):
        path = (private if private_file else public) / name
        with path.open("w", newline="") as stream:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(columns)
            writer.writerows(rows)
        if not private_file:
            files.append(
                dict(
                    relative_path=str(path.relative_to(root)),
                    sha256=file_hash(path),
                    format="csv",
                    schema_ref=name[:-4],
                    row_count=sum(1 for _ in csv.DictReader(path.open())),
                    visibility="public",
                    logical_asset_id="scenario." + name[:-4],
                )
            )
        return path

    for simulation in simulations:
        path = public / f"candidate-lines-{simulation.m.tenant}.csv"
        files.append(
            dict(
                relative_path=str(path.relative_to(root)),
                sha256=file_hash(path),
                format="csv",
                schema_ref="raw-candidate-line",
                row_count=simulation.candidate_count,
                visibility="public",
                logical_asset_id="scenario.candidate-lines",
            )
        )
    if profile.name == "diagnostic":
        path = public / "diagnostic-bindings.json"
        files.append(
            dict(
                relative_path=str(path.relative_to(root)),
                sha256=file_hash(path),
                format="json",
                schema_ref="diagnostic-bindings",
                row_count=0,
                visibility="public",
                logical_asset_id="scenario.diagnostic-bindings",
            )
        )
    orders = {(s.m.tenant, o["order_id"]): o for s in simulations for o in s.orders_summary}
    daily = defaultdict(int)
    revenue = []
    for r in read_rows(root, "core.revenue_entry"):
        revenue.append(r)
        if r["tenant_id"] == "101":
            daily[local_date(int(datetime.fromisoformat(r["recognized_at"]).timestamp()))] += int(
                r["amount_cent"]
            )
    # S03: mutually exclusive defects; preserve original row numbers and valid unmatched keys.
    if profile.name in {"demo", "diagnostic"}:
        rows = []
        valid = [i + 1 for i in range(1650)] + [100001 + i for i in range(50)]
        for key in valid:
            rows.append([len(rows) + 1, str(key), "2025-09"])
        for key in valid[:100]:
            rows.append([len(rows) + 1, str(key), "2025-09"])
        for _ in range(100):
            rows.append([len(rows) + 1, "", "2025-09"])
        for i in range(100):
            rows.append([len(rows) + 1, f"invalid-{i}", "2025-09"])
        path = write("campaign-list.csv", ["source_row", "customer_id", "campaign_code"], rows)
        write(
            "cleaning-oracle.csv",
            [
                "source_sha256",
                "raw",
                "unique_valid",
                "duplicates",
                "missing",
                "malformed",
                "unknown_members",
            ],
            [[file_hash(path), 2000, 1700, 100, 100, 100, 50]],
            True,
        )
    # S04: independent finance and operating snapshots; every bridge term uses source facts.
    # Exact knowledge cutoffs and the intentionally flawed duplicate join are declared in inputs.
    september = [
        r
        for r in revenue
        if r["tenant_id"] == "101"
        and "2025-09-01"
        <= local_date(int(datetime.fromisoformat(r["recognized_at"]).timestamp()))
        < "2025-10-01"
    ]
    finance = sum(int(r["amount_cent"]) for r in september)
    cutoff = "2025-09-28T16:00:00+00:00"
    known_revenue = [r for r in september if r["available_at"] <= cutoff]
    returns = sum(
        -int(r["amount_cent"]) for r in known_revenue if r["entry_type"] == "RETURN_ACCEPTED"
    )
    duplicate = sum(
        int(r["amount_cent"]) for r in known_revenue if int(r["order_unit_id"]) % 7 == 0
    )
    # Separate business cutoff from acquisition cutoff. Future cash is excluded from
    # both snapshots; late arrivals retain their original business event time.
    cash, business_cash, known_cash = 0, 0, 0
    for table, sign in [("core.payment", 1), ("core.refund", -1)]:
        for r in read_rows(root, table):
            o = orders.get((int(r["tenant_id"]), int(r["order_id"])))
            if (
                o
                and r["tenant_id"] == "101"
                and o["date"][:7] == "2025-09"
                and r["status"] == "SUCCEEDED"
                and r["attempted_at"] < "2025-09-30T16:00:00+00:00"
            ):
                value = sign * int(r["amount_cent"])
                cash += value
                if r["attempted_at"] < cutoff:
                    business_cash += value
                if r["available_at"] <= cutoff:
                    known_cash += value
    basis = cash - finance
    late = business_cash - known_cash
    operating = known_cash + returns + duplicate
    write(
        "finance-snapshot.csv",
        ["period", "metric", "amount_cent", "knowledge_cutoff"],
        [["2025-09", "DELIVERED_NET_REVENUE", finance, "2026-04-01T00:00:00+08:00"]],
    )
    write(
        "operating-snapshot.csv",
        ["period", "metric", "amount_cent", "knowledge_cutoff", "query_notes"],
        [
            [
                "2025-09",
                "LEGACY_OPERATING_METRIC",
                operating,
                "2025-09-29T00:00:00+08:00",
                (
                    "cash: Sep-created orders, attempted_at before Oct 1, available_at <= cutoff; "
                    "return addback and unit_id_mod_7 duplicate: Sep revenue available_at <= cutoff"
                ),
            ]
        ],
    )
    write(
        "reconciliation-oracle.csv",
        ["term", "amount_cent"],
        [
            ["returns", returns],
            ["late", -late],
            ["duplicate_join", duplicate],
            ["cash_basis", basis],
            ["business_cutoff", business_cash - cash],
            ["unexplained", 0],
            ["total_difference", operating - finance],
        ],
        True,
    )
    # S07: a dense 36-month series and 3 explicitly frozen 12-week holdouts.
    history = []
    for n in range(1096):
        date = local_date(START + n * DAY)
        history.append([date, daily.get(date, 0)])
    write("sales-history.csv", ["business_date", "net_revenue_cent"], history)
    windows = []
    for origin in ["2024-12-31", "2025-03-31", "2025-06-30"]:
        begin = day_start(origin) + DAY
        end = begin + 84 * DAY
        windows.append(
            [
                origin,
                stamp(begin),
                stamp(end),
                "12",
                "available_at <= origin end of day",
                "exclude tail; net revenue maturity required",
            ]
        )
        feature_values = defaultdict(int)
        for row in revenue:
            if row["tenant_id"] == "101" and row["available_at"] < stamp(begin):
                feature_values[
                    local_date(int(datetime.fromisoformat(row["recognized_at"]).timestamp()))
                ] += int(row["amount_cent"])
        write(
            f"forecast-features-{origin}.csv",
            ["business_date", "net_revenue_cent", "knowledge_cutoff"],
            [
                [local_date(at), feature_values[local_date(at)], stamp(begin)]
                for at in range(START, begin, DAY)
            ],
        )
        labels = [
            [origin, date, value]
            for date, value in history
            if local_date(begin) <= date < local_date(end)
        ]
        write(
            f"forecast-labels-{origin}.csv",
            ["origin", "business_date", "net_revenue_cent"],
            labels,
            True,
        )
    write(
        "forecast-windows.csv",
        [
            "origin",
            "holdout_start",
            "holdout_end_exclusive",
            "weeks",
            "feature_rule",
            "limitations",
        ],
        windows,
    )
    # S09: member units fixed before intervention, outcomes are real generated orders.
    if profile.name == "demo":
        intervention = day_start("2025-06-02")
        master = simulations[0].m
        members = master.scenario_customer_keys[10000:12000]
        member_set = set(members)
        cohort = [
            [
                "OUTREACH_2025",
                members[i],
                int(i < 1000),
                "2025-06-01",
                max(0, (intervention - master.customers[members[i]]["joined"]) // (30 * DAY)),
                master.customers[members[i]]["region"],
                1,
            ]
            for i in range(2000)
        ]
        write(
            "intervention-definition.csv",
            [
                "intervention_id",
                "treatment",
                "starts_at",
                "pre_weeks",
                "post_weeks",
                "identification_limit",
            ],
            [
                [
                    "OUTREACH_2025",
                    "会员运营触达",
                    stamp(intervention),
                    12,
                    8,
                    (
                        "observational; pretrend and covariate balance required; no "
                        "guaranteed causality"
                    ),
                ]
            ],
        )
        outcomes = defaultdict(lambda: [0, 0])
        for (tenant, _), o in orders.items():
            if tenant == 101 and o["customer"] in member_set:
                week = (day_start(o["date"]) - intervention) // (7 * DAY)
                if -12 <= week < 8:
                    outcomes[o["customer"], week][0] += int(o["paid"] > 0)
                    outcomes[o["customer"], week][1] += o["paid"]
        for row in cohort:
            row[-1] = min(5, 1 + sum(outcomes[row[1], w][0] for w in range(-12, 0)) // 2)
        write(
            "intervention-cohort.csv",
            [
                "intervention_id",
                "customer_id",
                "treated",
                "eligible_before",
                "tenure_months",
                "region_id",
                "prior_activity_band",
            ],
            cohort,
        )
        write(
            "intervention-observations.csv",
            ["customer_id", "relative_week", "paid_orders", "paid_amount_cent"],
            [[members[i], w, *outcomes[members[i], w]] for i in range(2000) for w in range(-12, 8)],
        )
        # Negative comparison selection is intentionally post hoc and carries an explicit boundary.
        write(
            "intervention-counterexample.csv",
            ["customer_id", "selected_treated", "selection_rule"],
            [
                [
                    members[i],
                    int(
                        sum(outcomes[members[i], w][0] for w in range(-6, 0))
                        > sum(outcomes[members[i], w][0] for w in range(-12, -6))
                    ),
                    "selected by rising pre-period activity; identification invalid",
                ]
                for i in range(2000)
            ],
        )
    # S10 fixed week windows and separate late/complete observations.
    weeks = []
    first = day_start("2025-09-01")
    for n in range(8):
        begin = first + n * 7 * DAY
        end = begin + 7 * DAY
        weeks.append(
            [
                n + 1,
                stamp(begin),
                stamp(end),
                stamp(end),
                "DELAYED" if n == 3 else "COMPLETE",
                stamp(end + 2 * DAY) if n == 3 else stamp(end),
            ]
        )
    write(
        "weekly-windows.csv",
        [
            "week",
            "start",
            "end_exclusive",
            "initial_observed_at",
            "initial_status",
            "ready_observed_at",
        ],
        weeks,
    )
    # Evidence documents contain observable events, dates and authority, never answer keys.
    docs = [
        (
            "inventory-policy",
            "2023-01-01",
            "采购和库存规则",
            "仓库按35天预测覆盖备货，门店21天；补货提前期4至9天。库存数量以流水与地点SKU快照为准。",
        ),
        (
            "promotion-plan",
            "2025-10-20",
            "11月活动方案",
            "11月部分渠道采用25%折扣。投放、折扣与售后费用需分别核算，活动期间毛利可能下降。",
        ),
        (
            "returns-sop",
            "2023-01-01",
            "售后验收流程",
            "交付后30天内受理申请。验收拒绝继续隔离；接受冲收入，可售回库冲原成本，判损后报废。",
        ),
        (
            "source-delay",
            "2025-09-28",
            "OMS采集延迟通知",
            "9月28日的OMS批次延迟一天到达。请检查每期水位，后补报表产生新版本。",
        ),
        (
            "source-recovery",
            "2025-09-30",
            "OMS恢复通知",
            "已补齐延迟批次；请按相同统计窗口和新的知识截止复算。",
        ),
        (
            "payment-incident",
            "2025-11-10",
            "小程序支付事件",
            "10:30至11:00出现支付成功率降低，11:00后恢复。以支付尝试为分母，不能直接推断最终订单成功率。",
        ),
        (
            "store-opening",
            "2024-01-01",
            "门店经营范围",
            "新店开业日期记录于site，比较同店增长时须固定门店集合，全部门店与同店分母分开。",
        ),
        (
            "identity-policy",
            "2023-01-01",
            "会员识别规则",
            "历史订单保留当时身份快照，未知会员不回填；留存仅比较已成熟且分母至少100的队列单元。",
        ),
    ]
    cutoff = day_start("2025-10-02")
    september = [
        r
        for r in revenue
        if r["tenant_id"] == "101"
        and day_start("2025-09-01")
        <= datetime.fromisoformat(r["recognized_at"]).timestamp()
        < day_start("2025-10-01")
        and datetime.fromisoformat(r["available_at"]).timestamp() <= cutoff
    ]
    total = sum(int(r["amount_cent"]) for r in september)
    docs.append(
        (
            "september-revenue-note",
            "2025-10-02",
            "9月收入观察记录",
            f"租户101；业务窗口为2025年9月，知识截止2025-10-02 00:00 Asia/Shanghai。"
            f"core.revenue_entry 可见{len(september)}条收入分录，净额{total / 100:.2f}元。"
            "本材料直接汇总可见分录，费用与采购成本须另查；后续知识截止可能改变结果。",
        )
    )
    master = simulations[0].m
    named = [p for p in master.spus.values() if p["key"] in {"101-p002", "101-p035"}]
    docs.append(
        (
            "training-top-catalog-note",
            "2026-03-31",
            "训练短袖商品档案摘录",
            "来源 core.spu 与当前冻结商品目录，观察截止2026-03-31。"
            + "；".join(
                f"{p['key']} {p['name']}，上市{local_date(p['launched'])}"
                + (
                    f"，停售{local_date(p['discontinued'])}"
                    if p["discontinued"] < day_start("2026-04-01")
                    else ""
                )
                for p in named
            )
            + "。新旧款并行期间应分别统计当时在售天数；替代关系属于经营计划，销量变化须查订单。",
        )
    )
    if profile.name == "diagnostic":
        docs = [
            (
                code,
                date,
                title,
                (
                    "普通经营包的分钟支付样本不足以复现每分钟百次压力场景。"
                    "高密度监控使用独立 demo profile。"
                )
                if code == "payment-incident"
                else body,
            )
            for code, date, title, body in docs
        ]
    for code, date, title, body in docs:
        path = public / (code + ".md")
        path.write_text(
            f"# {title}\n\n来源：虚构企业运营公告（合成数据）。\n"
            f"发布时间：{date} 21:00 Asia/Shanghai；事件时刻以正文及业务表为准。\n"
            f"有效范围：本合成数据 release；可信分类：业务材料，须与事实核对。\n\n{body}\n"
        )
        files.append(
            dict(
                relative_path=str(path.relative_to(root)),
                sha256=file_hash(path),
                format="markdown",
                schema_ref="business-document",
                row_count=1,
                visibility="public",
                logical_asset_id="scenario." + code,
            )
        )
    bindings = []
    refs = {
        "S03": ["campaign-list.csv"],
        "S04": ["finance-snapshot.csv", "operating-snapshot.csv"],
        "S07": ["sales-history.csv", "forecast-windows.csv"],
        "S09": [
            "intervention-definition.csv",
            "intervention-cohort.csv",
            "intervention-observations.csv",
            "intervention-counterexample.csv",
        ],
        "S10": ["weekly-windows.csv"],
        "S11": ["payment-incident.md"],
    }
    if profile.name == "diagnostic":
        refs["S05"] = ["diagnostic-bindings.json", "../reference.sql"]
        refs["S09"] = [
            "diagnostic-bindings.json",
            "../tables/core.intervention_definition",
            "../tables/core.intervention_cohort",
            "../tables/core.price_exposure",
        ]
        refs["S11"] = ["diagnostic-bindings.json"]
    for i in range(1, 13):
        sid = f"S{i:02}"
        enabled = sid in profile.scenarios
        bindings.append(
            dict(
                product_scenario_id=sid,
                data_story_ids={
                    "S01": ["D05", "D07", "D08"],
                    "S02": ["D02", "D05", "D08"],
                    "S04": ["D03", "D07"],
                    "S05": ["D01", "D02", "D03", "D07"],
                    "S06": ["D01", "D02", "D03", "D05", "D07"],
                    "S07": ["D05"],
                    "S10": ["D07"],
                    "S12": ["D05", "D08"],
                }.get(sid, []),
                input_refs=refs.get(sid, ["../reference.sql"]),
                reference_time=profile.reference_time,
                prerequisites=[
                    "fixed business and knowledge cutoffs",
                    "source permissions",
                    "observe cohort maturity and sample size",
                ],
                expected_outcome_class="supported_input" if enabled else "insufficient_sample",
                private_oracle_ref=f"validation:{sid}",
                negative_cases=[
                    "source permission denied",
                    "empty result or inadequate denominator",
                ],
                minimum_cohort=100,
                business_window=[profile.order_start, profile.order_end_exclusive],
                knowledge_cutoff="2026-04-02T00:00:00+08:00",
                source_scope="tenant/region/column restrictions enforced by source login",
                grain={
                    "S03": "source_row",
                    "S04": "period/metric",
                    "S07": "business_date/origin",
                    "S08": "assigned_member",
                    "S09": "member/week",
                    "S10": "week/observation",
                    "S11": "payment_attempt/minute",
                    "S12": "first_purchase_month/month_age",
                }.get(sid, "business fact with tenant and stable key"),
            )
        )
    path = public / "bindings.json"
    path.write_text(json.dumps(bindings, ensure_ascii=False, indent=2) + "\n")
    files.append(
        dict(
            relative_path="scenarios/bindings.json",
            sha256=file_hash(path),
            format="json",
            schema_ref="ScenarioBinding[]",
            row_count=12,
            visibility="public",
            logical_asset_id="scenario.bindings",
        )
    )
    return files
