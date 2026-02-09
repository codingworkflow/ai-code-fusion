# Manual Test: Docs UI Screenshots

Purpose: regenerate and verify documentation screenshots for the main app views.

## Command

```bash
npm run docs:screenshots
```

## Expected Outputs

The command should update these files:

- `docs/images/app-config-panel.png`
- `docs/images/app-select-panel.png`
- `docs/images/app-select-panel-selected.png`
- `docs/images/app-select-panel-resized.png`
- `docs/images/app-processed-panel.png`

## Verification Checklist

1. Open `docs/APP_VIEWS.md`.
2. Confirm all five images render.
3. Confirm screenshots reflect current UI labels:
   - `Start`
   - `Select Files`
   - `Processed Output`
4. Confirm `Processed Output` screenshot shows content and file/token summary.
