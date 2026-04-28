# Asset Report Stream Live Smoke

- Base URL: `http://localhost:3000`
- Generated At: 2026-04-28T02:55:04.122Z
- User ID: `user-7f985c3b-cb4c-46a3-995f-7533611acb5a`
- Session ID: `cmoi17aue008ozkhqchwv7kk8`
- Stream ID: `router-sse-3094cf16-6312-4863-8270-4a060af3413f`
- Event Count: 256

## Event Counts

- `user.message.saved`: 1
- `assistant.message.started`: 1
- `assistant.text.delta`: 235
- `card.created`: 1
- `card.patch`: 4
- `job.step`: 4
- `ping`: 7
- `card.completed`: 1
- `final_report.created`: 1
- `stream.done`: 1

## Important Events

- card.created seq=34 card_type=asset_report_progress
- card.patch seq=35 progress=25 step=collect_facts
- card.patch seq=37 progress=40 step=classify_assets
- card.patch seq=39 progress=58 step=score_radar
- card.patch seq=143 progress=72 step=write_summary
- card.completed seq=247
- final_report.created seq=248
- stream.done seq=249
