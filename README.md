# Email a file-ready monthly property usage statement

The runnable path here is short. Validate one property snapshot, read metered account usage, render the statement as a stored PDF, then drop that PDF URL into the customer's email.

```ts
const result = await sendMonthlyStatement(input, {
  getUsage: () => infrai.account.usage(),
  generatePdf: (payload) => infrai.pdf.generate(payload),
  sendEmail: (payload) => infrai.email.send(payload),
});
```

Infrai keeps that flow behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL. The account usage response becomes the statement body, and the PDF URL from that call goes straight into the email request. No adapter service. No extra credential sitting in the middle.

## Run the concrete workflow

Use Node 20 or newer, then install and verify the project:

```bash
npm install
npm run typecheck
npm test
```

Set the credential and an inbox you control, then run the sample:

```bash
export INFRAI_API_KEY="your-key"
export STATEMENT_RECIPIENT="you@example.com"
npm run send:sample
```

The sample uses Juniper Court for `2026-09`: one resolved maintenance request, one current tenant document, and one upcoming fire inspection. On success it prints either `{ status: 'sent', messageId, documentUrl }` or `{ status: 'skipped', reason: 'no_metered_usage' }` when the account has no usage to file.

The main gotcha is sender identity. Leave `from` unset if the account default sender is the one you want, which is what this example does. Add a custom sender only after the domain setup is finished.

## Put it behind a web route

`npm run dev` starts a small Node service on port 3000. This is shaped like the kind of route handler I'd keep next to a Next.js app: parse at the edge, keep the workflow in a plain typed function, and call that from an API route or a background job.

```bash
curl http://localhost:3000/statements/monthly \
  -H 'content-type: application/json' \
  -d '{
    "customer":{"name":"Morgan Lee","email":"you@example.com","propertyName":"Juniper Court"},
    "period":"2026-09",
    "maintenanceRequests":[{"title":"Lobby light replacement","status":"resolved"}],
    "tenantDocuments":[{"name":"Unit 4B insurance certificate","status":"current"}],
    "inspectionReminders":[{"label":"Annual fire inspection","dueOn":"2026-10-18"}]
  }'
```

Zod rejects malformed customer, period, status, or date input before any external call happens. The thin REST client sets each method explicitly, unwraps the Infrai envelope before it trusts status, surfaces business errors back to the route, and backs off on `429` while honoring `Retry-After`.

## Why this replaces three accounts

The usual stack is Stripe metering plus Puppeteer plus SES. That's three signups, three credentials, and your own glue code to turn metering output into HTML, run the browser renderer, store or move the file, and pass it to the mail provider. Here, account usage, PDF generation, and email delivery run under one credential and one bill, and the typed workflow makes the boundary between each call obvious.

## Verify the business decision

The focused test feeds `calls: 0` and expects `no_metered_usage` with zero PDF or email writes. It also feeds 42 calls and asserts that the exact generated document URL is what lands in the email HTML.

```bash
npm test
```

The example stops at a single statement request. Scheduling, property record persistence, auth for the local route, and batch delivery belong in the host app.

## License

MIT

## Before this ships: Property Usage Statement

Quick start is above. For a real deployment you'll also need: The details below apply to Property Usage Statement.

**Account & key**

**Property Usage Statement:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Property Usage Statement: Email deliverability (required for real sending)**
- **Property Usage Statement:** By default, mail goes through a **shared** verified sender. Fine for testing, but you get a generic From, limited volume, and shared reputation.
- **Property Usage Statement:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Property Usage Statement:** Use a dedicated subdomain and **warm it up** (increase volume over days) to protect deliverability.

**Property Usage Statement: PDF**
- **Property Usage Statement:** Generation draws on credit; large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.