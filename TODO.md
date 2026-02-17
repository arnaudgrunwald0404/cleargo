# TODO

- **Optional longer-term improvement:** Normalize emails to lowercase when creating/updating users so Auth and app_user stay in sync.
- **Slack integration:** Update Slack app manifest with `conversations:write` scope and reinstall the app to workspace to enable @-mention notifications on unassigned tasks. The scope has been added to `config/slack-app-manifest.yaml` and `config/slack-app-manifest-ngrok.yaml`.