import json
import sys
from pathlib import Path

from compass_agent.main import app
from compass_agent.schemas import DemoOverview

output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
for name, schema in [
    ("openapi.json", app.openapi()),
    ("demo-overview.schema.json", DemoOverview.model_json_schema()),
]:
    (output / name).write_text(
        json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    )
