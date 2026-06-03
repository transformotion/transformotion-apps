# Social IDP Setup — Google, Microsoft, Facebook

This document guides a developer through registering Transformotion Apps with each
social identity provider and loading the credentials into AWS Secrets Manager.
Once credentials are stored, redeploy the auth stack to activate social sign-in.

---

## Cognito Hosted UI redirect URI

Every provider's "allowed redirect / callback URI" must be:

```
https://transformotion-959516291617-dev.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse
```

(This is where Cognito receives the OAuth authorisation code from the provider.)

---

## 1 — Google

### 1.1 Create an OAuth 2.0 client in GCP Console

1. Open [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Select (or create) a project.
3. Click **Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Name: `Transformotion Apps Dev`.
6. Under **Authorised redirect URIs**, add:
   ```
   https://transformotion-959516291617-dev.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse
   ```
7. Click **Create**. Copy the **Client ID** and **Client secret**.

### 1.2 Enable the People API (required for email/profile scopes)

In GCP Console → **APIs & Services → Enable APIs**, search for and enable:
- **Google People API**

### 1.3 Load credentials into Secrets Manager

```bash
aws secretsmanager put-secret-value \
  --secret-id /dev/cognito/google-client-id \
  --secret-string "YOUR_GOOGLE_CLIENT_ID"

aws secretsmanager put-secret-value \
  --secret-id /dev/cognito/google-client-secret \
  --secret-string "YOUR_GOOGLE_CLIENT_SECRET"
```

---

## 2 — Microsoft (OIDC via Azure)

### 2.1 Register an application in Azure Portal

1. Open [https://portal.azure.com](https://portal.azure.com) → **Azure Active Directory → App registrations**.
2. Click **New registration**.
3. Name: `Transformotion Apps Dev`.
4. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (multi-tenant + personal).
5. Redirect URI: **Web** →
   ```
   https://transformotion-959516291617-dev.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse
   ```
6. Click **Register**. Copy the **Application (client) ID**.

### 2.2 Create a client secret

In the app registration → **Certificates & secrets → New client secret**.
Set an expiry (24 months recommended), then copy the **Value** immediately — it is only shown once.

### 2.3 Grant API permissions

In **API permissions**, confirm `openid`, `email`, `profile` are present (they are added by default for Microsoft Graph).

### 2.4 Load credentials into Secrets Manager

```bash
aws secretsmanager put-secret-value \
  --secret-id /dev/cognito/microsoft-client-id \
  --secret-string "YOUR_AZURE_APPLICATION_CLIENT_ID"

aws secretsmanager put-secret-value \
  --secret-id /dev/cognito/microsoft-client-secret \
  --secret-string "YOUR_AZURE_CLIENT_SECRET_VALUE"
```

---

## 3 — Facebook

### 3.1 Create an app in Meta for Developers

1. Open [https://developers.facebook.com/apps](https://developers.facebook.com/apps).
2. Click **Create App → Consumer → Next**.
3. App name: `Transformotion Apps Dev`. Click **Create App**.

### 3.2 Add Facebook Login product

On the app dashboard, click **Add Product** → **Facebook Login → Set Up → Web**.

### 3.3 Configure OAuth redirect

In **Facebook Login → Settings**:
- **Valid OAuth Redirect URIs**:
  ```
  https://transformotion-959516291617-dev.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse
  ```
- Save changes.

### 3.4 Enable public_profile and email permissions

In **App Review → Permissions and Features**, confirm `email` and `public_profile` are enabled (both are available without review for development).

### 3.5 Get App ID and App Secret

**Settings → Basic** → copy **App ID** and **App Secret**.

### 3.6 Load credentials into Secrets Manager

```bash
aws secretsmanager put-secret-value \
  --secret-id /dev/cognito/facebook-app-id \
  --secret-string "YOUR_FACEBOOK_APP_ID"

aws secretsmanager put-secret-value \
  --secret-id /dev/cognito/facebook-app-secret \
  --secret-string "YOUR_FACEBOOK_APP_SECRET"
```

---

## 4 — Apple (placeholder — not yet active)

Apple Sign-In requires an Apple Developer Program membership and additional CDK work.
The four Secrets Manager entries below are placeholders; do not populate them until
the Apple IDP CDK construct is added.

```
/dev/cognito/apple-team-id
/dev/cognito/apple-client-id
/dev/cognito/apple-key-id
/dev/cognito/apple-private-key
```

When ready, refer to the [Cognito Apple IDP docs](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp.html).

---

## 5 — Redeploy the auth stack

After loading all three active providers (Google, Microsoft, Facebook), redeploy:

```bash
pnpm --dir infrastructure exec cdk deploy --app 'npx ts-node --prefer-ts-exts bin/launchpad.ts' TransformotionDev-LaunchpadAuth --require-approval never
```

CloudFormation resolves the `{{resolve:secretsmanager:...}}` dynamic references at
deploy time and updates the Cognito IDP configurations with the real credentials.

Social sign-in buttons on the Sign In screen will become active once the stack update completes.

---

## Prod setup

Repeat sections 1–3 for prod, substituting `/dev/` with `/prod/` in all secret names and
using the prod Cognito Hosted UI domain once the prod stack is deployed.
