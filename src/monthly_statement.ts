import { z } from "zod";

export const statementRequestSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    propertyName: z.string().min(1),
  }),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  maintenanceRequests: z.array(
    z.object({ title: z.string().min(1), status: z.enum(["open", "scheduled", "resolved"]) }),
  ),
  tenantDocuments: z.array(
    z.object({ name: z.string().min(1), status: z.enum(["current", "expiring", "missing"]) }),
  ),
  inspectionReminders: z.array(
    z.object({ label: z.string().min(1), dueOn: z.string().date() }),
  ),
});

export type StatementRequest = z.infer<typeof statementRequestSchema>;

export type UsageSnapshot = {
  calls: number;
  total_cost: number;
};

export type StatementDependencies = {
  getUsage(): Promise<UsageSnapshot>;
  generatePdf(input: {
    html: string;
    page_size: string;
    orientation: string;
    store: boolean;
  }): Promise<{ url: string }>;
  sendEmail(input: { to: string; subject: string; html: string }): Promise<{ message_id: string }>;
};

export type StatementResult =
  | { status: "skipped"; reason: "no_metered_usage" }
  | { status: "sent"; messageId: string; documentUrl: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

function rows(items: string[]): string {
  return items.length > 0
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>None recorded.</p>";
}

function statementHtml(input: StatementRequest, usage: UsageSnapshot): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Monthly usage statement</title></head>
<body>
  <h1>${escapeHtml(input.customer.propertyName)}</h1>
  <p>Monthly usage statement for ${escapeHtml(input.period)}</p>
  <h2>Metered account activity</h2>
  <p>${usage.calls} calls; recorded cost USD ${usage.total_cost.toFixed(2)}.</p>
  <h2>Maintenance requests</h2>
  ${rows(input.maintenanceRequests.map((item) => `${item.title}: ${item.status}`))}
  <h2>Tenant documents</h2>
  ${rows(input.tenantDocuments.map((item) => `${item.name}: ${item.status}`))}
  <h2>Inspection reminders</h2>
  ${rows(input.inspectionReminders.map((item) => `${item.label}: ${item.dueOn}`))}
</body></html>`;
}

export async function sendMonthlyStatement(
  input: StatementRequest,
  dependencies: StatementDependencies,
): Promise<StatementResult> {
  const usage = await dependencies.getUsage();
  if (usage.calls === 0) return { status: "skipped", reason: "no_metered_usage" };

  const pdf = await dependencies.generatePdf({
    html: statementHtml(input, usage),
    page_size: "A4",
    orientation: "portrait",
    store: true,
  });
  const delivery = await dependencies.sendEmail({
    to: input.customer.email,
    subject: `${input.customer.propertyName} usage statement - ${input.period}`,
    html: `<p>Hello ${escapeHtml(input.customer.name)},</p><p>Your monthly statement is ready: <a href="${escapeHtml(pdf.url)}">download the PDF</a>.</p>`,
  });
  return { status: "sent", messageId: delivery.message_id, documentUrl: pdf.url };
}
