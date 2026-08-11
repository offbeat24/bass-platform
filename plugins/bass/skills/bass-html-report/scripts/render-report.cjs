#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const [source, output] = process.argv.slice(2);
if (!source || !output) {
  console.error("usage: render-report.cjs <record.json> <report.html>");
  process.exit(2);
}
const record = JSON.parse(fs.readFileSync(path.resolve(source), "utf8"));
if (!record.task_id || !record.summary_of_changes || !record.verification) throw new Error("Invalid BASS run record");
const css = fs.readFileSync(path.join(__dirname, "..", "assets", "report.css"), "utf8");
const evaluations = (record.verification.evaluations_run || []).map((item) => `<tr><td>${escape(item.name)}</td><td>L${Number(item.level)}</td><td><span class="status ${item.status === "pass" || item.status === "skipped" ? "" : "fail"}">${escape(item.status)}</span></td></tr>`).join("");
const files = (record.files_changed || []).map((file) => `<li><code>${escape(file)}</code></li>`).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(record.task_id)} BASS report</title><style>${css}</style></head><body><main><h1>${escape(record.task_id)}</h1><p class="meta">BASS handoff report</p><h2>Outcome</h2><p>${escape(record.summary_of_changes)}</p><p>${escape(record.why)}</p><h2>Changed files</h2><ul>${files}</ul><h2>Verification</h2><table><thead><tr><th>Check</th><th>Level</th><th>Status</th></tr></thead><tbody>${evaluations}</tbody></table><h2>Known limitations</h2><ul>${(record.known_limitations || []).map((item) => `<li>${escape(item)}</li>`).join("") || "<li>None recorded</li>"}</ul></main></body></html>`;
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(path.resolve(output), html, "utf8");
console.log(path.resolve(output));

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
