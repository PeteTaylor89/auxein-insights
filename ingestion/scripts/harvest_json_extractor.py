import json
import pandas as pd

# Load your JSON (from file or API response)
site_list = ['barbour', 'black_estate', 'muddy_water', 'netherwood']
site = "barbour"

with open(
    f"A:\\auxein-insights-V0.1\\ingestion\\config\\harvest_graphs_{site}.json",
    "r"
) as f:
    data = json.load(f)

rows = []

for graph_id, graph in data["graphs"].items():
    graph_name = graph.get("graph_name", "")
    graph_tabs = graph.get("graph_tabs", [])

    for trace_id, trace in graph.get("traces", {}).items():
        rows.append({
            "site": site,
            "trace_id": int(trace_id),
            "trace_name": trace.get("trace_name"),
            "graph_id": int(graph_id),
            "graph_name": graph_name,
            "tabs": ",".join(graph_tabs),
            "uom": trace.get("uom"),
            "hidden": trace.get("trace_hidden", "0") == "1"
        })

df_traces = pd.DataFrame(rows)

print(df_traces.head())