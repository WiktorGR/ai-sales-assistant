"""
Generates workflows/01-email-intake.json from prompts/*.md so prompts in the
repo and in n8n never drift apart. Run: python3 workflows/build/build-01-email-intake.py
After importing, select credentials in the Gemini nodes (they are not exported).
"""
import json
import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
NS = uuid.UUID("6f1c2a52-0000-4000-8000-000000000001")


def nid(name: str) -> str:
    # Stable IDs keep diffs readable between regenerations.
    return str(uuid.uuid5(NS, name))


def prompt(name: str) -> tuple[str, str]:
    text = (ROOT / "prompts" / f"{name}.md").read_text()
    system = text.split("## System prompt", 1)[1].split("## User message", 1)[0].strip()
    user = text.split("## User message", 1)[1].strip()
    return system, user


nodes: list[dict] = []
connections: dict = {}


def node(name, type_, version, pos, params, **extra):
    nodes.append({"id": nid(name), "name": name, "type": type_, "typeVersion": version,
                  "position": list(pos), "parameters": params, **extra})


def connect(src, dst, out=0, kind="main"):
    outs = connections.setdefault(src, {}).setdefault(kind, [])
    while len(outs) <= out:
        outs.append([])
    outs[out].append({"node": dst, "type": kind, "index": 0})


def set_node(name, pos, fields):
    node(name, "n8n-nodes-base.set", 3.4, pos, {
        "assignments": {"assignments": [
            {"id": nid(name + k), "name": k, "value": v, "type": t} for k, v, t in fields
        ]},
        "options": {},
    })


def api_call(name, pos, path, body_expr):
    node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "POST",
        "url": "={{ $env.API_URL }}" + path,
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify(" + body_expr + ") }}",
        "options": {},
    })


def if_true(name, pos, expr):
    node(name, "n8n-nodes-base.if", 2.2, pos, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
            "conditions": [{
                "id": nid(name + "cond"),
                "leftValue": expr,
                "rightValue": "",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
            }],
            "combinator": "and",
        },
        "options": {},
    })


def llm_chain(name, pos, prompt_name, temperature):
    system, user = prompt(prompt_name)
    node(name, "@n8n/n8n-nodes-langchain.chainLlm", 1.7, pos, {
        "promptType": "define",
        "text": "=" + user,
        "messages": {"messageValues": [{"message": "=" + system}]},
    }, retryOnFail=True, maxTries=3, waitBetweenTries=5000)
    model = f"Gemini ({prompt_name})"
    node(model, "@n8n/n8n-nodes-langchain.lmChatGoogleGemini", 1.2, (pos[0], pos[1] + 200), {
        "modelName": "={{ $env.LLM_MODEL }}",
        "options": {"temperature": temperature},
    })
    connect(model, name, kind="ai_languageModel")


EMAIL = "$('Normalize email').item.json"
CLASSIFICATION = "$('Validate: classification').item.json.data"

# --- Intake -----------------------------------------------------------------
node("Webhook: intake", "n8n-nodes-base.webhook", 2, (0, 300), {
    "httpMethod": "POST", "path": "intake", "responseMode": "responseNode", "options": {},
}, webhookId=nid("webhook-intake"))

set_node("Normalize email", (220, 300), [
    ("messageId", "={{ $json.body.messageId || 'webhook-' + $execution.id }}", "string"),
    ("from", "={{ $json.body.from }}", "string"),
    ("subject", "={{ $json.body.subject || '' }}", "string"),
    ("body", "={{ $json.body.body }}", "string"),
])
connect("Webhook: intake", "Normalize email")

# --- Guard before any LLM call ------------------------------------------------
api_call("Guard: email", (440, 300), "/guard", "{ email: $json }")
connect("Normalize email", "Guard: email")
if_true("Flagged?", (660, 300), "={{ $json.flagged }}")
connect("Guard: email", "Flagged?")

# --- Classify -----------------------------------------------------------------
llm_chain("LLM: Classify", (880, 400), "classify", 0)
connect("Flagged?", "LLM: Classify", out=1)
api_call("Validate: classification", (1100, 400), "/validate", "{ schema: 'classification', data: $json.text }")
connect("LLM: Classify", "Validate: classification")
if_true("Classification valid?", (1320, 400), "={{ $json.ok }}")
connect("Validate: classification", "Classification valid?")

node("Route by category", "n8n-nodes-base.switch", 3.2, (1540, 300), {
    "rules": {"values": [
        {"conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [{"id": nid("route" + c), "leftValue": "={{ $json.data.category }}", "rightValue": c,
                            "operator": {"type": "string", "operation": "equals"}}],
            "combinator": "and"},
         "renameOutput": True, "outputKey": c}
        for c in ("order", "inquiry", "complaint")
    ]},
    "options": {"fallbackOutput": "extra", "renameFallbackOutput": "other"},
})
connect("Classification valid?", "Route by category")

# --- Extract (order / inquiry) -----------------------------------------------
# Placeholder until the Google Sheets node is connected: same shape as samples/price-list.csv.
node("Price list", "n8n-nodes-base.code", 2, (1760, 200), {
    "mode": "runOnceForEachItem",
    "jsCode": "// TODO: replace with Google Sheets (PRICE_LIST_SHEET_ID) + Aggregate\n"
              "return { json: { priceList: [\n"
              + "".join(
                  f"  {{ sku: '{r[0]}', name: '{r[1]}', unitPrice: {r[2]}, currency: '{r[3]}' }},\n"
                  for r in (l.split(",") for l in
                            (ROOT / "samples/price-list.csv").read_text().strip().splitlines()[1:]))
              + "] } };",
})
connect("Route by category", "Price list", out=0)
connect("Route by category", "Price list", out=1)

llm_chain("LLM: Extract", (1980, 200), "extract", 0)
connect("Price list", "LLM: Extract")
api_call("Validate: extraction", (2200, 200), "/validate", "{ schema: 'extraction', data: $json.text }")
connect("LLM: Extract", "Validate: extraction")
if_true("Extraction valid?", (2420, 200), "={{ $json.ok }}")
connect("Validate: extraction", "Extraction valid?")

api_call("Guard: email + extraction", (2640, 100), "/guard",
         f"{{ email: {EMAIL}, extraction: $json.data }}")
connect("Extraction valid?", "Guard: email + extraction")
if_true("Flagged after extraction?", (2860, 100), "={{ $json.flagged }}")
connect("Guard: email + extraction", "Flagged after extraction?")

# --- Results ------------------------------------------------------------------
set_node("Result: manual review", (3080, 0), [
    ("messageId", f"={{{{ {EMAIL}.messageId }}}}", "string"),
    ("status", "manual_review", "string"),
    ("reasons", "={{ $json.reasons || [{ code: $json.code, detail: $json.error }] }}", "array"),
])
connect("Flagged?", "Result: manual review", out=0)
connect("Flagged after extraction?", "Result: manual review", out=0)
connect("Classification valid?", "Result: manual review", out=1)
connect("Extraction valid?", "Result: manual review", out=1)

set_node("Result: ready for offer", (3080, 200), [
    ("messageId", f"={{{{ {EMAIL}.messageId }}}}", "string"),
    ("status", "ready_for_offer", "string"),
    ("classification", f"={{{{ {CLASSIFICATION} }}}}", "object"),
    ("extraction", "={{ $('Validate: extraction').item.json.data }}", "object"),
    ("warnings", "={{ $json.reasons }}", "array"),
])
connect("Flagged after extraction?", "Result: ready for offer", out=1)

set_node("Result: complaint", (3080, 400), [
    ("messageId", f"={{{{ {EMAIL}.messageId }}}}", "string"),
    ("status", "complaint_logged", "string"),
    ("classification", "={{ $json.data }}", "object"),
])
connect("Route by category", "Result: complaint", out=2)

set_node("Result: ignored", (3080, 600), [
    ("messageId", f"={{{{ {EMAIL}.messageId }}}}", "string"),
    ("status", "ignored", "string"),
    ("classification", "={{ $json.data }}", "object"),
])
connect("Route by category", "Result: ignored", out=3)

node("Respond", "n8n-nodes-base.respondToWebhook", 1.1, (3300, 300), {
    "respondWith": "json", "responseBody": "={{ $json }}", "options": {},
})
for r in ("Result: manual review", "Result: ready for offer", "Result: complaint", "Result: ignored"):
    connect(r, "Respond")

workflow = {
    "name": "01 Email intake",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "pinData": {},
    "active": False,
}

out = ROOT / "workflows" / "01-email-intake.json"
out.write_text(json.dumps(workflow, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {out.relative_to(ROOT)} ({len(nodes)} nodes)")
