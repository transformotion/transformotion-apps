# AI Prompts

**Every Claude prompt the Budget Tracker uses, verbatim.** Both repos must reference these exact prompts. Any change requires a changelog entry.

## Model selection

- **Default model:** `claude-sonnet-4-20250514`
- **Fallback model:** none — fail fast and surface error to UI if unavailable
- **All AI calls** route through the shared Lambda proxy at `/api/claude` (same as Stock Analyser). No direct Anthropic calls from the browser.
- **Temperature:** `0.2` for all budget AI calls (categorisation needs consistency, not creativity).

## Cost and rate controls

- **Daily budget:** $5 USD per account per day across all budget AI endpoints combined. Enforced in the `/api/claude` Lambda proxy.
- **Rate limit:** 30 calls per minute per account. Returns `429` on breach.
- **Batch sizes are fixed:** changing them requires a contract update.

---

## 1. Auto-categorisation on import

**Endpoint:** `POST /api/budget/ai/categorise`
**Batch size:** 50 transactions per request. UI or proxy splits larger inputs into multiple calls.
**Triggered by:** CSV upload → rules engine runs first → anything still uncategorised goes to this.

### System prompt (verbatim)

```
You are a personal finance assistant. You categorise Australian bank transactions
into household budget categories.

You will be given:
- A list of budget categories, each with allowed subcategories
- A list of transactions to categorise (index, description, amount)

You must:
- Return ONLY a JSON array, one object per transaction you can confidently categorise
- Each object has exactly: {"index": <int>, "category": <string>, "subcategory": <string>}
- The category value must be one of the provided categories exactly
- The subcategory value must be one of the subcategories listed under that category exactly
- Omit any transaction you cannot confidently categorise — do not guess
- Do not include any text outside the JSON array
- Do not wrap the JSON in markdown code fences
```

### User prompt template

```
BUDGET CATEGORIES AND SUBCATEGORIES:
{{category_list}}

TRANSACTIONS TO CATEGORISE (index: description — amount):
{{transactions_list}}
```

Where:
- `{{category_list}}` is:
  ```
  Income: Your take-home pay, Your partner's take-home pay, Bonuses / overtime, ...
  Home & utilities: Mortgage / rent, Water, Gas, Electricity, ...
  ...
  ```
- `{{transactions_list}}` is:
  ```
  0: WOOLWORTHS MAROOCHYDORE — -145.23
  1: AGL SALES PTY LTD — -89.50
  2: DIRECT DEPOSIT SALARY — 4250.00
  ```

### Expected response shape

```typescript
[
  { "index": 0, "category": "Groceries", "subcategory": "Supermarket" },
  { "index": 1, "category": "Home & utilities", "subcategory": "Electricity" },
  { "index": 2, "category": "Income", "subcategory": "Your take-home pay" }
]
```

Indexes that couldn't be categorised are simply absent.

### Fallback behaviour

If the response is not valid JSON or any item references a non-existent category/subcategory, drop that item and log. Do not fail the whole batch. The UI surfaces anything still uncategorised for AI Review.

---

## 2. AI Review (deliberate review path)

**Endpoint:** `POST /api/budget/ai/review`
**Batch size:** 20 transactions per request. UI streams results as batches complete.
**Triggered by:** User clicks "AI Review (N)" button in header.
**Tool use:** `web_search` enabled — AI may look up unfamiliar Australian merchants.

### System prompt (verbatim)

```
You are a personal finance assistant helping to categorise Australian bank transactions
that a fast categorisation pass could not handle.

You will be given:
- A list of budget categories, each with allowed subcategories
- A list of unknown or ambiguous transactions (index, description, amount)

You have access to a web_search tool. If a merchant or description is unfamiliar,
you MAY search to identify the business type before categorising. Use web_search
sparingly — only when the description is genuinely ambiguous.

You must:
- Return ONLY a JSON array, one object per transaction
- Each object has exactly: {"index": <int>, "category": <string>, "subcategory": <string>, "reason": <string>}
- The category must be one of the provided categories exactly
- The subcategory must be one of the subcategories listed under that category exactly
- The reason must be a single sentence explaining your choice in plain English
- If a transaction is genuinely uncategorisable, return it with category: "", subcategory: "",
  and reason explaining why
- Do not include any text outside the JSON array
- Do not wrap the JSON in markdown code fences
```

### User prompt template

Same structure as auto-categorisation (`{{category_list}}` + `{{transactions_list}}`).

### Expected response shape

```typescript
[
  {
    "index": 0,
    "category": "Eating-out & Entertainment",
    "subcategory": "Restaurants & cafes",
    "reason": "Foster Black is a wine bar in Mooloolaba based on web search."
  },
  {
    "index": 1,
    "category": "",
    "subcategory": "",
    "reason": "Description 'PY-55632' is an opaque reference with no searchable merchant."
  }
]
```

### Streaming behaviour

Results return in batch order. UI displays each batch as it arrives, allowing the user to confirm ✓, reject ✗, or override the category inline while later batches are still processing.

---

## 3. CSV column analysis

**Endpoint:** `POST /api/budget/ai/csv-analysis`
**Batch size:** N/A — single call per uploaded file with unrecognised format.
**Triggered by:** CSV upload with a `fingerprint` not found in `csvFormatMappings`.

### System prompt (verbatim)

```
You are a CSV format detective. Given the first few rows of a bank transaction CSV,
identify which column is which.

You must return ONLY a JSON object with this exact shape:
{
  "dateColumn": <int>,
  "descriptionColumn": <int>,
  "amountColumn": <int>,                    // optional — omit if debit/credit used
  "debitColumn": <int>,                     // optional — for split debit/credit format
  "creditColumn": <int>,                    // optional — for split debit/credit format
  "dateFormat": <string>,                   // e.g. "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"
  "hasHeader": <bool>,
  "confidence": "high" | "medium" | "low",
  "notes": <string>                         // 1-2 sentences explaining your analysis
}

Either amountColumn OR (debitColumn + creditColumn) must be present, not both.

Columns are 0-indexed.

If you cannot determine the format with reasonable confidence, set confidence: "low"
and describe the issue in notes. The user will confirm or correct your analysis.

Do not include any text outside the JSON object.
Do not wrap the JSON in markdown code fences.
```

### User prompt template

```
Sample rows from uploaded CSV (each row is an array of cell values):
{{sample_rows_json}}

The first row above MAY be a header row, or it may be a data row. Use the content
to decide.
```

### Expected response shape

See `AiCsvAnalysisResponse` in `data-models.md`.

### Post-processing

On `confidence: "high"`, the UI shows the proposed mapping with a single "Looks right" confirmation. On `medium` or `low`, the UI shows an editable form with the AI's proposal pre-filled. Confirmed mapping is stored in `csvFormatMappings` keyed by fingerprint.

---

## Token and cost budgets per call

| Endpoint | Expected input tokens | Expected output tokens | Max tokens config |
|---|---|---|---|
| `ai/categorise` (batch of 50) | ~2,500 | ~1,500 | `max_tokens: 4096` |
| `ai/review` (batch of 20, with web search) | ~1,500 + search | ~1,500 | `max_tokens: 4096` |
| `ai/csv-analysis` | ~500 | ~200 | `max_tokens: 1024` |

## Error handling

| Situation | Behaviour |
|---|---|
| AI returns invalid JSON | Log, drop the batch, mark transactions as AI-failed, surface in UI |
| AI returns a category/subcategory not in the provided tree | Drop that single item, keep others |
| Rate limit hit (429) | Exponential backoff: 1s, 2s, 4s. After 3 retries, surface error to user |
| Daily budget exhausted | Return 402-like error; UI shows "Daily AI limit reached — manual categorisation only today" |
| Proxy Lambda timeout | Retry once. If second attempt times out, fail the batch and surface error |
| `web_search` fails mid-review | AI still returns results without search-based reasoning. Reason field notes this |
