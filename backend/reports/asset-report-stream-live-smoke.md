# Asset Report Stream Live Smoke

- Base URL: `http://127.0.0.1:3000`
- Generated At: 2026-04-28T09:17:21.488Z
- User ID: `user-18b90bc4-22b1-4810-989a-7baa1b83f752`
- Session ID: `cmoiev8bw000333mfujg5rgiy`
- Stream ID: `router-sse-266216b1-a313-481f-bf26-aa244834c57d`
- Event Count: 142

## Event Counts

- `user.message.saved`: 1
- `assistant.message.started`: 1
- `assistant.text.delta`: 122
- `card.created`: 1
- `card.patch`: 4
- `job.step`: 4
- `ping`: 6
- `card.completed`: 1
- `final_report.created`: 1
- `stream.done`: 1

## Important Events

- card.created seq=34 card_type=asset_report_progress
- card.patch seq=35 progress=25 step=collect_facts
- card.patch seq=37 progress=40 step=classify_assets
- card.patch seq=39 progress=58 step=score_radar
- card.patch seq=132 progress=72 step=write_summary
- card.completed seq=134
- final_report.created seq=135
- stream.done seq=136
