import json
import os

subagents = {
    "e795c7db-5d17-4bb9-82a2-cf65ae2012a2": "Algorithmic & Math Specialist",
    "63c5c2a4-7686-4e47-a6bd-cf519e6650da": "Client-Side Performance Engineer",
    "e496558b-4cd6-4e99-8234-9a04dc345691": "State Management Auditor",
    "559c5b8f-acd5-4978-b1c0-e2379f1a2460": "DOM & UI Rendering Specialist",
    "1bd6c85a-c2c2-48ca-9d99-9382ecab1109": "Event Architecture Reviewer",
    "82ba8796-79d0-4113-9134-9123f094499c": "Data Architecture Expert",
    "ed414734-2965-4207-9e03-717b4da84b0d": "Python ETL Pipeline Reviewer",
    "318e64eb-f3f0-4220-975f-15944389b755": "Vanilla JS Module Architect",
    "b39039db-8164-4635-a184-31735a25661c": "Edge Cases & Error Handler",
    "2405207f-e99d-4607-95c4-46cf7e5edf33": "Scalability & Future-Proof Reviewer"
}

output_data = {}

for cid, role in subagents.items():
    path = f"C:\\Users\\betaland operatore\\.gemini\\antigravity\\brain\\{cid}\\.system_generated\\logs\\transcript.jsonl"
    print(f"Reading {role} ({cid})...")
    if not os.path.exists(path):
        print(f"  File not found: {path}")
        continue
    
    reports = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                step = json.loads(line)
                # Check for tool_calls containing send_message
                if "tool_calls" in step:
                    for tc in step["tool_calls"]:
                        if tc.get("name") == "send_message":
                            msg_args = tc.get("args", {})
                            msg = msg_args.get("Message", "")
                            # Sometimes the arg is a JSON string of a string, or double escaped
                            if msg.startswith('"') and msg.endswith('"'):
                                try:
                                    msg = json.loads(msg)
                                except:
                                    pass
                            reports.append(msg)
            except Exception as e:
                print(f"  Error parsing line in {cid}: {e}")
                
    if reports:
        output_data[role] = reports[-1]  # Get the latest report sent
        print(f"  Found report of length {len(reports[-1])}")
    else:
        print("  No report found in transcript.")

# Save the reports compiled
with open("c:\\Users\\betaland operatore\\Documents\\Mondiali\\scratch\\compiled_reports.json", "w", encoding="utf-8") as f:
    json.dump(output_data, f, indent=2, ensure_ascii=False)
print("Finished compiling reports to compiled_reports.json")
