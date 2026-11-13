# Render beta deployment: settings that must be set in the dashboard

The beta runs the Web on Vercel (`https://mfu-internship-system.vercel.app`) and the
API on one Render web service (`mfu-internship-api`). Code alone cannot fix the items
below; they are environment variables on the Render service
(Dashboard → mfu-internship-api → Environment). Save, then redeploy.

## 1. Run the Worker inside the API service

Render's free plan has no background worker, so queued invitation emails, PDFs and
exports were never processed.

| Variable          | Value  |
| ----------------- | ------ |
| `EMBEDDED_WORKER` | `true` |

The Docker image (`infrastructure/docker/Dockerfile.api`) now contains the Worker and
starts it next to the API when this is `true`.

## 2. Real email delivery

`MAIL_DELIVERY_MODE=capture` only delivers to a local Mailpit, so no email leaves the
system. For Gmail, create an App Password (Google Account → Security → 2-Step
Verification → App passwords).

| Variable             | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| `MAIL_DELIVERY_MODE` | `smtp`                                                 |
| `SMTP_HOST`          | `smtp.gmail.com`                                       |
| `SMTP_PORT`          | `465`                                                  |
| `SMTP_SECURE`        | `true`                                                 |
| `SMTP_USER`          | the sending Gmail address                              |
| `SMTP_PASSWORD`      | the 16-character App Password                          |
| `SMTP_FROM`          | `ระบบประเมินผลการฝึกงาน มฟล. <the same Gmail address>` |

## 3. Links inside emails and exports

Invitation links and the Excel `PDF URL` column are built from this value.

| Variable         | Value                                      |
| ---------------- | ------------------------------------------ |
| `PUBLIC_WEB_URL` | `https://mfu-internship-system.vercel.app` |
| `CORS_ORIGINS`   | `https://mfu-internship-system.vercel.app` |

## 4. File storage (fonts, images, PDFs, exports)

Saving document templates uploads the Sarabun font, and students' PDFs are stored in
S3-compatible storage. With `S3_ENDPOINT` pointing at `localhost` these fail. Any
S3-compatible provider works, for example Supabase Storage (S3 access keys under
Project Settings → Storage) or Cloudflare R2.

| Variable               | Value                                  |
| ---------------------- | -------------------------------------- |
| `S3_ENDPOINT`          | the provider's `https://` S3 endpoint  |
| `S3_REGION`            | the provider's region (R2 uses `auto`) |
| `S3_BUCKET`            | a private bucket name                  |
| `S3_ACCESS_KEY_ID`     | access key                             |
| `S3_SECRET_ACCESS_KEY` | secret key                             |
| `S3_FORCE_PATH_STYLE`  | `true`                                 |

## 5. Slow first load

The free API sleeps after 15 idle minutes and takes about 30 s to wake.
`.github/workflows/keep-warm.yaml` pings it every 10 minutes. GitHub may delay or
skip scheduled runs, so the Render Starter plan is the dependable fix.
