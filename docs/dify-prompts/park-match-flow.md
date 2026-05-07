# park_match_flow policy candidate contract

The policy catalog in PostgreSQL is the source of truth. Dify may explain and
rank policy candidates, but it must not invent policies, source URLs, filing
status, or application availability.

## Required input

The backend sends `policy_candidates_json` in `payload.difyInputs`.

Each candidate contains:

- `policy_id`
- `region`
- `title`
- `status`
- `statusText`
- `fine_tags`
- `sources[]`
- `matchReason`
- `nextAction`

`sources[]` contains only these source types:

- `apply_entry`
- `official_original`
- `pdf`
- `interpretation`
- `news`

## Guardrails

- Use only candidates from `policy_candidates_json`.
- Do not create a new policy name.
- Do not create a new URL.
- Any returned `policy_id` must exist in `policy_candidates_json`.
- Any returned URL must appear in that candidate's `sources[]`.
- Prefer `open_apply` policies that contain an `apply_entry`.
- Do not describe `entry_pending` as available to apply immediately.
- Do not describe `trial_watch` as a formal active policy.
- A PDF can support filing guidance or a policy checklist, but a PDF alone does
  not prove immediate application availability.

## Recommended wording

- Use "值得核验" or "可能相关".
- Avoid "你能申请" unless the backend status is `open_apply`, an `apply_entry`
  exists, and the answer still says the user must confirm eligibility on the
  official page or local service window.
