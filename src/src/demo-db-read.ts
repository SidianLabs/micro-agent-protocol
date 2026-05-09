import { readFile } from "node:fs/promises";

const port = Number(process.env.PORT ?? 8787);
const baseUrl = `http://localhost:${port}`;

async function loadExample(name: string): Promise<unknown> {
  const fileUrl = new URL(`../../examples/${name}`, import.meta.url);
  const content = await readFile(fileUrl, "utf8");
  return JSON.parse(content);
}

async function main(): Promise<void> {
  const envelope = await loadExample("dbread-task-envelope.json");

  const response = await fetch(`${baseUrl}/dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      capability: "db.read.aggregate",
      envelope
    })
  });

  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
