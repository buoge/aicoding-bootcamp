"""Assemble the complete offline report and reviewable specification package.

This tool packages existing specifications and validation evidence. It does not
run the not-yet-implemented Contoso fork or generate production business data.
Requires Pandoc; call the documented validators before building a new package.
"""
from __future__ import annotations

import base64
import hashlib
import html
import json
import re
import shutil
import subprocess
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "deliverables"
TICK = chr(96) * 3
CSS = """
:root{color-scheme:light;--ink:#173348;--muted:#506878;--line:#d7e2e9;--blue:#1475a1}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}
body{margin:0 40px 80px 318px;max-width:1180px;color:var(--ink);background:#fff;
font:16px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
overflow-wrap:anywhere}
#TOC{position:fixed;inset:0 auto 0 0;width:278px;background:#102d42;color:#d7e8f1;
padding:26px 22px;overflow:auto;font-size:13px;line-height:1.7}
#TOC a{color:#d7e8f1;text-decoration:none}#TOC a:hover{color:#fff;text-decoration:underline}
#TOC ul{list-style:none;margin:0;padding-left:14px}#TOC>ul{padding-left:0}
#TOC li{margin:9px 0}#TOC>ul>li{margin:16px 0}#TOC ul ul{border-left:1px solid #3b586c}
header{padding:46px 0 22px;border-bottom:3px solid var(--ink);margin-bottom:30px}
header .title{font-size:34px;line-height:1.35;margin:0 0 14px;letter-spacing:-.03em}
header .subtitle{font-size:19px;color:var(--muted);margin:0}
header .date{font-size:13px;color:var(--muted);margin:9px 0 0}
h1,h2,h3,h4{line-height:1.5;color:#143c56;scroll-margin-top:24px}
h1{font-size:29px;margin:64px 0 24px;padding-bottom:12px;border-bottom:2px solid var(--line)}
h2{font-size:23px;margin:42px 0 18px}h3{font-size:19px;margin:30px 0 14px}
h4{font-size:17px;margin:26px 0 12px}p{margin:14px 0}
a{color:#0d729d;text-underline-offset:3px}strong{font-weight:700}
table{border-collapse:collapse;display:block;width:100%;max-width:100%;overflow-x:auto;
margin:22px 0 30px;font-size:14px;line-height:1.7;border:1px solid var(--line)}
thead{background:#edf3f7}th{text-align:left;font-weight:700;white-space:normal}
th,td{border-bottom:1px solid var(--line);padding:11px 13px;vertical-align:top;min-width:74px}
tbody tr:nth-child(even){background:#f8fafc}td:first-child{min-width:130px}
code{font:12.7px/1.7 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
background:#edf3f7;border-radius:3px;padding:2px 4px}
pre{font-size:12.7px;background:#f0f4f7;border:1px solid var(--line);padding:19px;
overflow:auto;max-height:48rem;line-height:1.6;white-space:pre;overflow-wrap:normal}
pre code{padding:0;background:none;line-height:1.6}
blockquote{margin:22px 0;border-left:4px solid #2788af;padding:5px 18px;background:#f1f7fa;color:#37596e}
ul,ol{padding-left:26px}li{margin:5px 0}
figure{margin:26px 0;padding:14px;border:1px solid var(--line);border-radius:8px;background:#fff}
img{display:block;max-width:100%;height:auto;margin:auto}
figcaption{text-align:center;color:var(--muted);font-size:13px;margin-top:12px}
details{border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:20px 0}
summary{cursor:pointer;font-weight:700;color:#176487}
.report-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}
.report-summary div{padding:15px 18px;background:#edf5f9;border-top:3px solid #237da1;border-radius:3px}
.report-summary b{display:block;font-size:25px;line-height:1.4}.report-summary span{font-size:12px;color:#506878}
.report-note{background:#f7f9fb;border:1px solid var(--line);padding:15px 19px;font-size:14px}
.source-file{font-size:13px;color:var(--muted)}
@media(max-width:1050px){body{margin:0 24px 60px;max-width:none}#TOC{position:static;width:auto;margin:0 -24px 25px;padding:20px 24px;max-height:360px}header{padding-top:28px}.report-summary{grid-template-columns:repeat(2,1fr)}}
@media print{body{margin:0;font-size:10pt;max-width:none}#TOC{position:static;width:auto;color:#173348;background:white;font-size:9pt;page-break-after:always}#TOC a{color:#173348}header{padding:12px 0}.report-summary{display:none}pre,table{display:table;overflow:visible;max-height:none;font-size:8pt}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2,h3{page-break-after:avoid}tr,img{page-break-inside:avoid}details{display:block}a{color:#173348;text-decoration:none}}
"""


def read_json(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fence(text: str, lang: str = "") -> str:
    return TICK + lang + "\n" + text.rstrip() + "\n" + TICK + "\n"


def appendix(title: str, relative_path: str) -> str:
    """Namespace headings; keep appendix internals out of the compact side TOC."""
    content = (ROOT / relative_path).read_text(encoding="utf-8")
    rows = content.splitlines()
    if rows and rows[0].startswith("# "):
        rows = rows[1:]
    in_code = False
    output = []
    for line in rows:
        if line.startswith(TICK):
            in_code = not in_code
        if not in_code and re.match(r"^#{2,5} ", line):
            line = "#" + line
        output.append(line)
    return "\n\n# " + title + "\n\n" + '<p class="source-file">对应附件：' + html.escape(relative_path) + "</p>\n\n" + "\n".join(output) + "\n"


class AuditHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.scripts = []
        self.ids = []
        self.anchors = []
        self.local_links = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.append(a["id"])
        if tag == "img":
            self.images.append(a.get("src", ""))
        if tag == "script":
            self.scripts.append(a.get("src", "inline"))
        if tag == "a":
            href = a.get("href", "")
            if href.startswith("#"):
                self.anchors.append(href[1:])
            elif href and not href.startswith(("https://", "http://", "mailto:", "data:")):
                self.local_links.append(href)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    schema = read_json("config/schema_contract.json")
    assets = read_json("config/asset_catalog.json")
    pg = read_json("validation/spec_validation_report.json")
    gold = read_json("validation/golden_fixture_report.json")
    refs = read_json("validation/reference_algorithms_report.json")
    questions = read_json("validation/question_catalog.json")
    if not pg["passed"] or not gold["passed"] or refs["status"] != "PASS":
        raise RuntimeError("Recorded specification / fixture / reference evidence is not PASS.")
    for item in assets["source_fingerprints"]:
        if digest(ROOT / item["path"]) != item["sha256"]:
            raise RuntimeError("Asset catalog fingerprint stale: " + item["path"])
    n_tables = len(schema["tables"])
    n_columns = sum(len(t["columns"]) for t in schema["tables"])
    n_fk = sum(len(t["foreign_keys"]) for t in schema["tables"])
    assert (n_tables, n_columns, n_fk) == (63, 643, 219)
    assert assets["canonical_table_count"] == n_tables
    assert assets["intermediate_asset_count"] == 10
    assert questions["schema_contract_sha256_at_review"] == digest(ROOT/"config/schema_contract.json")
    assert questions["question_count"] == len(questions["questions"]) == 30
    fields_by_table={t["name"]:{c["name"] for c in t["columns"]} for t in schema["tables"]}
    source_references=0
    column_references=0
    for question in questions["questions"]:
        for source in question["required_sources"]:
            assert source["table"] in fields_by_table, source["table"]
            assert set(source["columns"]) <= fields_by_table[source["table"]], question["question_id"]
            source_references+=1
            column_references+=len(source["columns"])

    main_doc = (ROOT / "docs/technical_design.md").read_text(encoding="utf-8")
    main_doc = main_doc.split("\n", 1)[1]
    main_doc = main_doc.replace("## 中国全渠道运动户外品牌 · 企业级多租户 Data Agent 课程项目", "")
    blocks = list(re.finditer(TICK + r"mermaid\n([\s\S]*?)" + TICK, main_doc))
    diagrams = [
        ("10_order_lifecycle", "订单、履约与售后状态主链；边界和特殊分支见正文"),
        ("11_production_dag", "Contoso 与 Python 数据生产 DAG"),
    ]
    assert len(blocks) == len(diagrams)
    for match, (stem, caption) in reversed(list(zip(blocks, diagrams))):
        if not (ROOT / "diagrams" / (stem + ".svg")).exists():
            raise RuntimeError("Missing process SVG; run node tools/render_flows.mjs")
        replacement = "![" + caption + "](diagrams/" + stem + ".svg)\n\n"
        replacement += "<details>\n<summary>查看可编辑的 Mermaid 图源</summary>\n\n"
        replacement += fence(match.group(1), "mermaid") + "\n</details>"
        main_doc = main_doc[:match.start()] + replacement + main_doc[match.end():]
    main_doc = main_doc.replace("../diagrams/", "diagrams/")
    front = '<div class="report-summary"><div><b>1,000,000</b><span>创建订单目标</span></div><div><b>63 / 643</b><span>表 / 字段</span></div><div><b>219</b><span>外键关系</span></div><div><b>9 + 2</b><span>ER 图 / 过程图</span></div></div>\n\n'
    front += '<div class="report-note">阅读指南：前 14 章给出完整设计与实施标准；附录 A—I 提供逐资产、逐字段、逐阶段与逐题细则；附录 J 收录可复制的 SQL 和配置。图像已嵌入本文件，可离线阅读。业务数量为生产目标；本次实际验证边界见第 11 章及附录 I。</div>\n\n'
    pieces = [front, main_doc]
    chapters = [
        ("附录 A：完整数据资产清单（63 张规范表 + 10 份中间资产）", "docs/asset_catalog.md"),
        ("附录 B：完整数据库字段字典（643 字段）", "docs/schema_dictionary.md"),
        ("附录 C：Contoso 改造与详细数据生产方案", "docs/generation.md"),
        ("附录 D：逐表生产映射、库存事件腿与可见时间", "docs/generation_mapping.md"),
        ("附录 E：多租户、区域、成本与历史时点安全契约", "docs/security_contract.md"),
        ("附录 F：三个参考指标接口与完整返回字段", "docs/metrics_contract.md"),
        ("附录 G：模型边界与审阅决议", "docs/model_review_resolution.md"),
        ("附录 H：30 道 Data Agent 评测题与证据契约", "docs/question_catalog.md"),
    ]
    pieces.extend(appendix(title, path) for title, path in chapters)
    pg_count = len(pg["checks"])
    gold_count = len(gold["checks"])
    gold_fields = sum(len(c.get("fields", [])) for c in gold["checks"])
    evidence = f"""

# 附录 I：实际验证证据与适用边界

这些记录验证本技术包的规格、SQL 和独立小样，不能替代百万订单发布验收。

| 验证 | 已执行结果 | 适用范围 |
|---|---:|---|
| 模型 / DDL / SQL / 受限身份 / 三个指标函数 | {pg_count} 项通过 | PostgreSQL 17.5（PGlite）；含 77 条断言 SQL 的编译执行及恶意输入、越权和小样指标检查 |
| 独立 8 单金标 | {gold_count} 项、{gold_fields} 个结果字段通过 | 金额、跨期、迟到、重复回调、五桶；使用独立规格模型，不代替 63 表全量装载 |
| 参考算法 | {refs["checks_passed"]}/{refs["checks_total"]} 通过 | 随机向量、CDF、精确配额、整数分、星期数组；未执行 C# fork |
| ER 图 | 9 组已渲染 | 来源为同一模型；全部 219 FK 仍以 DDL 为准 |

订单记录实际创建量为 0；配额算法只计算 3,288 个日期桶。SQL 空库的 H01/H02 非零违规是刻意记录的未生产证据，不作为全量数据通过。金标中在途库存全为零，没有验证一次完整调拨或采购在途生命周期。生产阶段仍须完成全部状态路径、FIFO、全量快照重算、百万规模压力与云端实测。
"""
    pieces.append(evidence)
    for title, path in [
        ("规格与权限检查报告", "validation/spec_validation_report.json"),
        ("独立金标检查报告", "validation/golden_fixture_report.json"),
        ("参考算法检查报告", "validation/reference_algorithms_report.json"),
    ]:
        pieces.append("\n<details>\n<summary>" + title + "（完整 JSON）</summary>\n\n" + fence((ROOT/path).read_text(), "json") + "\n</details>\n")
    pieces.append("\n# 附录 J：完整 SQL 与配置原文\n\n这些代码与同名附件内容一致。schema JSON、资产 JSON、逐题 JSON、工具源码和图源另全部收录于 ZIP。DDL 当前为非分区 PostgreSQL 17 规范表，Parquet 的分区规则属于导出契约。\n")
    for label, path, lang in [
        ("完整建表 DDL", "sql/01_schema.sql", "sql"),
        ("可执行安全策略", "sql/02_security.sql", "sql"),
        ("可执行参考指标", "sql/03_metrics.sql", "sql"),
        ("百万版配置", "config/profile_1m.yaml", "yaml"),
        ("8 个私有场景", "config/scenarios.yaml", "yaml"),
        ("Contoso 补丁与中间字段契约", "config/contoso_patch_contract.json", "json"),
        ("77 条发布 SQL", "validation/acceptance.sql", "sql"),
        ("算法参考实现", "tools/reference_algorithms.py", "python"),
    ]:
        pieces.append("\n<details>\n<summary>" + label + " · " + path + "</summary>\n\n" + fence((ROOT/path).read_text(), lang) + "\n</details>\n")

    assembled = "\n".join(pieces)
    md_path = ROOT / "contoso_1m_full.md"
    md_path.write_text(assembled, encoding="utf-8")
    html_path = ROOT / "contoso_1m_full.html"
    pandoc = shutil.which("pandoc")
    if not pandoc:
        raise RuntimeError("Pandoc is required to build the offline report.")
    result = subprocess.run([
        pandoc, str(md_path), "--from=markdown+raw_html+fenced_code_blocks+pipe_tables",
        "--to=html5", "--standalone", "--toc", "--toc-depth=2",
        "--mathml", "--no-highlight", "--metadata=lang:zh-CN",
        "--metadata=title:Contoso 百万订单数据准备技术方案",
        "--metadata=subtitle:中国全渠道运动户外 · 多租户 Data Agent · 完整实施契约",
        "--metadata=date:版本 1.0.0 · 2026-10-19",
    ], cwd=ROOT, check=True, text=True, capture_output=True)
    rendered = result.stdout
    rendered = re.sub(r"<style>[\s\S]*?</style>", "", rendered)
    rendered = rendered.replace("</head>", "<style>" + CSS + "</style>\n</head>")
    def embed_image(match):
        source = html.unescape(match.group(1))
        image_path = (ROOT / source).resolve()
        if not image_path.is_relative_to(ROOT):
            raise RuntimeError("Unexpected image path: " + source)
        if image_path.suffix.lower() != ".svg":
            raise RuntimeError("Expected SVG report image: " + source)
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        return 'src="data:image/svg+xml;base64,' + encoded + '"'
    rendered = re.sub(r'src="(diagrams/[^"]+)"', embed_image, rendered)
    audit = AuditHTML()
    audit.feed(rendered)
    missing = sorted(set(audit.anchors) - set(audit.ids))
    if len(audit.images) != 11 or any(not s.startswith("data:image/svg+xml;base64,") for s in audit.images):
        raise RuntimeError("Report images are incomplete or not embedded.")
    if audit.scripts or audit.local_links or missing or len(audit.ids) != len(set(audit.ids)):
        raise RuntimeError("Offline HTML audit failed: " + str({"scripts":audit.scripts, "local_links":audit.local_links,"missing":missing}))
    html_path.write_text(rendered, encoding="utf-8")

    package_report = {
        "status":"PASS", "scope":"Specification artifact packaging and offline HTML structural audit; no production data generated.",
        "tables":n_tables, "columns":n_columns, "foreign_keys":n_fk,
        "canonical_assets":63, "intermediate_assets":10, "er_images":9, "process_images":2,
        "embedded_svg_images":len(audit.images), "external_scripts":len(audit.scripts),
        "missing_anchor_targets":missing, "duplicate_html_ids":len(audit.ids)-len(set(audit.ids)),
        "specification_checks":pg_count, "golden_checks":gold_count, "golden_fields":gold_fields,
        "reference_checks":refs["checks_passed"], "production_orders_generated":0,
        "question_count":30, "valid_question_source_references":source_references,
        "valid_question_column_references":column_references,
        "schema_sha256":digest(ROOT/"config/schema_contract.json"),
        "profile_sha256":digest(ROOT/"config/profile_1m.yaml"),
        "html_bytes":html_path.stat().st_size,
        "render_note":"ER and process SVG/PNG were inspected; standalone HTML passed structural, image-embedding and anchor audits. No full browser screenshot or PDF layout certification."
    }
    (ROOT/"validation/package_report.json").write_text(json.dumps(package_report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    approved_dirs={"config","docs","diagrams","sql","tools","validation"}
    top_files={"README.md","package.json","contoso_1m_full.md","contoso_1m_full.html"}
    files=sorted(p for p in ROOT.rglob("*") if p.is_file() and
                 ((len(p.relative_to(ROOT).parts)>1 and p.relative_to(ROOT).parts[0] in approved_dirs) or
                  p.name in top_files) and "__pycache__" not in p.parts and not p.name.endswith(".pyc"))
    file_manifest={"package_version":"1.0.0","purpose":"Technical specification, not generated million-order dataset",
                   "excluded":["contributions (superseded working reviews)","node_modules","production data"],
                   "files":[{"path":p.relative_to(ROOT).as_posix(),"bytes":p.stat().st_size,"sha256":digest(p)} for p in files]}
    mf=ROOT/"package_manifest.json"
    mf.write_text(json.dumps(file_manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    files.append(mf)
    zip_path=OUT/"contoso_1m_technical_package.zip"
    with zipfile.ZipFile(zip_path,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in files:
            info=zipfile.ZipInfo("contoso_1m_spec/"+p.relative_to(ROOT).as_posix(),date_time=(2026,10,19,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o644<<16
            z.writestr(info,p.read_bytes())
    copies=[
        (html_path,"contoso_1m_technical_design.html"),
        (ROOT/"sql/01_schema.sql","contoso_1m_schema.sql"),
        (ROOT/"docs/schema_dictionary.md","contoso_1m_schema_dictionary.md"),
    ]
    for src,name in copies:
        shutil.copy2(src,OUT/name)
    with zipfile.ZipFile(zip_path) as z:
        assert z.testzip() is None
        assert len(z.namelist())==len(files)
    print(json.dumps({"status":"PASS","package_files":len(files),"deliverables":[
        {"path":str(p),"bytes":p.stat().st_size,"sha256":digest(p)}
        for p in [OUT/n for _,n in copies]+[zip_path]]},ensure_ascii=False))


if __name__=="__main__":
    main()
