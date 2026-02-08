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
          RELEASE_VERSION: ${{ github.event.release.tag_name }}
          BACKEND_SHA: ${{ github.event.release.target_commitish }}
          BACKEND_REPO: ${{ github.repository }}
          # Temporary source: main-v2 branch OpenAPI spec.
          SPEC_URL: https://raw.githubusercontent.com/BrigadaSOS/Nadeshiko/main-v2/backend/docs/generated/openapi.yaml
          PRERELEASE: ${{ github.event.release.prerelease }}
        run: |
          VERSION="${RELEASE_VERSION#v}"
          gh api repos/BrigadaSOS/nadeshiko-sdk-ts/dispatches \
            -f event_type=backend_release \
            -f client_payload[version]="$VERSION" \
            -f client_payload[release_tag]="$RELEASE_TAG" \
            -f client_payload[prerelease]="$PRERELEASE" \
            -f client_payload[spec_url]="$SPEC_URL" \
            -f client_payload[backend_sha]="$BACKEND_SHA" \
            -f client_payload[backend_repo]="$BACKEND_REPO"
```

Payload contract expected by SDK repo:
- `version` (semver without `v`)
- `release_tag` (with `v`)
- `prerelease` (`true`/`false`)
- `spec_url` (for now, main-v2 raw URL)
- `backend_sha`
- `backend_repo`
