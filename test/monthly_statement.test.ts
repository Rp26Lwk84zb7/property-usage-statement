import assert from "node:assert/strict";
import test from "node:test";
import { sendMonthlyStatement, type StatementDependencies } from "../src/monthly_statement.js";

const input = {
  customer: { name: "Avery", email: "avery@example.com", propertyName: "Lake House" },
  period: "2026-09",
  maintenanceRequests: [{ title: "Boiler check", status: "scheduled" as const }],
  tenantDocuments: [{ name: "Lease", status: "current" as const }],
  inspectionReminders: [{ label: "Smoke alarm", dueOn: "2026-10-10" }],
};

test("skips PDF and email when the account has no metered usage", async () => {
  let writes = 0;
  const dependencies: StatementDependencies = {
    getUsage: async () => ({ calls: 0, total_cost: 0 }),
    generatePdf: async () => { writes += 1; return { url: "https://example.com/unused.pdf" }; },
    sendEmail: async () => { writes += 1; return { message_id: "unused" }; },
  };

  const result = await sendMonthlyStatement(input, dependencies);
  assert.deepEqual(result, { status: "skipped", reason: "no_metered_usage" });
  assert.equal(writes, 0);
});

test("passes the generated PDF URL directly into the statement email", async () => {
  let emailHtml = "";
  const dependencies: StatementDependencies = {
    getUsage: async () => ({ calls: 42, total_cost: 1.25 }),
    generatePdf: async () => ({ url: "https://documents.example/statement.pdf" }),
    sendEmail: async (payload) => {
      emailHtml = payload.html;
      return { message_id: "msg_123" };
    },
  };

  const result = await sendMonthlyStatement(input, dependencies);
  assert.equal(result.status, "sent");
  assert.match(emailHtml, /https:\/\/documents\.example\/statement\.pdf/);
});
