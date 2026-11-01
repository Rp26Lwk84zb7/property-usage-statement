import { createServer } from "node:http";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError } from "./infrai_client.js";
import { sendMonthlyStatement, statementRequestSchema, type UsageSnapshot } from "./monthly_statement.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service.");

const infrai = createInfraiClient(apiKey);

function reply(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/statements/monthly") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = statementRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await sendMonthlyStatement(input, {
      getUsage: () => infrai.account.usage() as Promise<UsageSnapshot>,
      generatePdf: (payload) => infrai.pdf.generate(payload),
      sendEmail: (payload) => infrai.email.send(payload),
    });
    reply(response, result.status === "sent" ? 201 : 200, result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      reply(response, status, { error: error.code, message: error.message });
      return;
    }
    reply(response, 500, { error: "Unexpected service error" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Statement service listening on http://localhost:${process.env.PORT ?? 3000}`);
});
