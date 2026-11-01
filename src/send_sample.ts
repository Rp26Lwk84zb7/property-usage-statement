import { createInfraiClient } from "./infrai_client.js";
import { sendMonthlyStatement, type UsageSnapshot } from "./monthly_statement.js";

const apiKey = process.env.INFRAI_API_KEY;
const recipient = process.env.STATEMENT_RECIPIENT;
if (!apiKey || !recipient) throw new Error("Set INFRAI_API_KEY and STATEMENT_RECIPIENT.");

const infrai = createInfraiClient(apiKey);
const result = await sendMonthlyStatement(
  {
    customer: { name: "Morgan Lee", email: recipient, propertyName: "Juniper Court" },
    period: "2026-09",
    maintenanceRequests: [{ title: "Lobby light replacement", status: "resolved" }],
    tenantDocuments: [{ name: "Unit 4B insurance certificate", status: "current" }],
    inspectionReminders: [{ label: "Annual fire inspection", dueOn: "2026-10-18" }],
  },
  {
    getUsage: () => infrai.account.usage() as Promise<UsageSnapshot>,
    generatePdf: (payload) => infrai.pdf.generate(payload),
    sendEmail: (payload) => infrai.email.send(payload),
  },
);

console.log(result);
