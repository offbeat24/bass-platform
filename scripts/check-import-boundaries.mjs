import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src", "nan", "domain");
const forbidden = [
  /from\s+["'][^"']*\/adapters\//,
  /from\s+["'](?:node:)?(?:fs|path|child_process|process)["']/,
  /from\s+["'](?:pixi\.js|phaser|playcanvas|@capacitor\/[^"']+|unity)["']/i,
];
const violations = [];

for (const file of fs.readdirSync(root).filter((name) => name.endsWith(".ts")).sort()) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) violations.push(`${file}: forbidden domain dependency ${pattern}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("NAN import boundary PASS");
