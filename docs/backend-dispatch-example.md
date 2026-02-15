# Backend -> SDK Dispatch Example

Use this in the backend repository release workflow to trigger SDK publication when a backend release is published.

Required secret in backend repo:
- `SDK_REPO_DISPATCH_TOKEN`: fine-scoped token that can dispatch workflows to `BrigadaSOS/nadeshiko-sdk-ts`.

```yaml
name: Release Backend

on:
  release:
    types:
      - published

jobs:
  trigger-sdk:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger SDK release workflow
        env:
          GH_TOKEN: ${{ secrets.SDK_REPO_DISPATCH_TOKEN }}
          RELEASE_TAG: ${{ github.event.release.tag_name }}
          BACKEND_SHA: ${{ github.event.release.target_commitish }}
          BACKEND_REPO: ${{ github.repository }}
          # Prefer a release-pinned OpenAPI asset URL.
          SPEC_URL: https://github.com/BrigadaSOS/Nadeshiko/releases/download/${{ github.event.release.tag_name }}/openapi.yaml
        run: |
          gh api repos/BrigadaSOS/nadeshiko-sdk-ts/dispatches \
            -f event_type=backend_release \
            -f client_payload[release_tag]="$RELEASE_TAG" \
            -f client_payload[spec_url]="$SPEC_URL" \
            -f client_payload[backend_sha]="$BACKEND_SHA" \
            -f client_payload[backend_repo]="$BACKEND_REPO"
```

Payload contract expected by SDK repo:
- `spec_url` (required; workflow derives all SDK versions from `info.version` in this spec)
- `backend_sha` (required)
- `backend_repo` (required)
- `release_tag` (optional; defaults to `v<spec info.version>`)
- `force` (optional; `true`/`false`)
- `internal_dist_tag` (optional; defaults to `internal`, e.g. `preview`)

If `release_tag` is provided, it must match `spec info.version`.

Version behavior (derived from spec `info.version`):
- `1.4.0` -> publish public `1.4.0` and internal `1.4.0-1`
- `1.4.0-1` -> publish internal only `1.4.0-1` (public stays `1.4.0`)
- `1.4.1` -> publish public `1.4.1` and internal `1.4.1-1`

Example: internal-only preview update driven by spec version `1.4.0-2`:

```bash
gh api repos/BrigadaSOS/nadeshiko-sdk-ts/dispatches \
  -f event_type=backend_release \
  -f client_payload[release_tag]="v1.4.0-2" \
  -f client_payload[spec_url]="https://github.com/BrigadaSOS/Nadeshiko/releases/download/v1.4.0-2/openapi.yaml" \
  -f client_payload[backend_sha]="<sha>" \
  -f client_payload[backend_repo]="BrigadaSOS/Nadeshiko" \
  -f client_payload[internal_dist_tag]="preview"
```
