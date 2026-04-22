# Post-deploy checklist — LaunchpadAppClient rename

**Context:** CDK PR renames the Cognito User Pool Client from `WebAppClient` / `transformotion-web-{stage}` to `LaunchpadAppClient` / `transformotion-launchpad-{stage}`.

CloudFormation will destroy the old client and create a new one, generating a new client ID. All steps below must be completed after the CDK deploy succeeds.

---

## CloudFormation change summary

| Change | Detail |
|---|---|
| Removed | `UserPoolWebAppClientCD2D5CB1` (`transformotion-web-dev`) |
| Added | `UserPoolLaunchpadAppClient6A3DF4C7` (`transformotion-launchpad-dev`) |
| Export name | `Transformotion-dev-UserPoolClientId` — **unchanged** |

---

## Steps

### 1. Capture the new client ID

After deploy completes, run:

```bash
aws cloudformation describe-stacks \
  --stack-name TransformotionDev-Auth \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
  --output text \
  --region ap-southeast-2
```

Record the new client ID (replaces `186dnb4lj8n7fbkjuhdetfi48a`).

### 2. Update GitHub Actions secret / variable

`NEXT_PUBLIC_COGNITO_CLIENT_ID` is stored as a GitHub Actions variable (repo or environment level).

1. Go to **Settings → Secrets and variables → Actions → Variables**
2. Find `NEXT_PUBLIC_COGNITO_CLIENT_ID`
3. Update value to the new client ID captured in step 1
4. Trigger a CD deploy (or manually re-run the last successful CD run) so the launchpad Next.js build picks up the new value

### 3. Verify Cognito federation (Google / Facebook / Microsoft)

The new client inherits federation config from CDK, but confirm in the AWS Console:
- **User Pools → transformotion → App clients → transformotion-launchpad-dev**
- Confirm: OAuth flows, callback/logout URLs, identity providers all present

### 4. Smoke test sign-in

After the launchpad re-deploys with the new client ID:
- Navigate to `https://dev.apps.transformotion.com.au`
- Sign in via email/password (Cognito)
- Sign in via Google (if accessible)
- Confirm redirect back to launchpad works

### 5. Confirm old client is gone

In AWS Console → Cognito → User Pools → transformotion → App clients:
- `transformotion-web-dev` should no longer appear
- `transformotion-launchpad-dev` should be present

### 6. Mark complete in STABILISATION_FREEZE.md

Update the "Pending post-deploy cleanups" section to mark this item done.

---

## Rollback

If the new client doesn't work correctly (e.g. federation misconfigured), redeploy with the CDK change reverted — this will recreate `WebAppClient` with a new client ID and you'll need to repeat the GitHub variable update step with that ID.

There is no way to restore the original client ID `186dnb4lj8n7fbkjuhdetfi48a` — Cognito generates new IDs on create.
