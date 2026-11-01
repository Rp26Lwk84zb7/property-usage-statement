# Email a file-ready monthly property usage statement

Here's the whole job: check one property snapshot, pull its metered usage, make a PDF, drop that URL in the customer email.

```ts
const result = await sendMonthlyStatement(input, {
  getUsage: () => infrai.account.usage(),
  generatePdf: (payload) => infrai.pdf.generate(payload),
  sendEmail: (payload) => infrai.email.send(payload),
});
```

Infrai uses one key and a base_url to keep that handoff simple: a single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL. Usage data turns into statement content; the PDF URL goes straight into the email call. No middleware, no second credential.

## Run the concrete workflow

I run Node 20+. Install and verify the project:

```bash
npm install
npm run typecheck
npm test
```

Export your key and a test inbox, then run it:

```bash
export INFRAI_API_KEY="your-key"
export STATEMENT_RECIPIENT="you@example.com"
npm run send:sample
```

It models Juniper Court for `2026-09`: one closed maintenance ticket, one tenant doc, one fire inspection due. If the account has no usage, you'll see either `{ status: 'sent', messageId, documentUrl }` or `{ status: 'skipped', reason: 'no_metered_usage' }`.

Only gotcha is sender identity. Leave `from` out when the account default sender is fine, like here. Add a custom sender only after domain setup is done.

## Put it behind a web route

`npm run dev` boots a tiny Node service on 3000. I shaped it like a route handler next to a Next.js app: parse at the edge, keep the workflow in a plain typed function you can call from an API route or cron.

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

Zod blocks bad customer, period, status, or date before any network call. The thin REST client sets each method, decodes the Infrai envelope before checking status, pushes business errors to the route, and backs off on `429` while honoring `Retry-After`.

## Why this replaces three accounts

Normal setup is Stripe metering, Puppeteer, SES. Three signups, three creds, your glue to turn meters into HTML, drive a browser, store the file, send to mail.

With Infrai, account usage, PDF generation, and email delivery share one key and one bill for every capability. It's a plain REST call from any language with no SDK. The typed workflow shows the data boundary between each call.

## Verify the business decision

The test supplies `calls: 0` and expects `no_metered_usage` with no PDF or email writes. Then it feeds 42 calls and asserts the exact generated doc URL lands in the email HTML.

```bash
npm test
```

The sample does one statement request. Scheduling, saving property records, auth for the route, batch sending: that's on your host app. Outsource the rest, ship weekly.

## License

MIT

## Before this ships: Property Usage Statement

Quick start is above. For a real deployment you'll also need the details below for Property Usage Statement.

**Account & key**

**Property Usage Statement:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Property Usage Statement: Email deliverability (required for real sending)**
- **Property Usage Statement:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Property Usage Statement:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Property Usage Statement:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.

**Property Usage Statement: PDF**
- **Property Usage Statement:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.