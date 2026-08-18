import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = json("package.json");
const codex = json("plugins/bass/.codex-plugin/plugin.json");
const claude = json("plugins/bass/.claude-plugin/plugin.json");
const codexMarket = json(".agents/plugins/marketplace.json");
const claudeMarket = json(".claude-plugin/marketplace.json");
const hooks = json("plugins/bass/hooks/hooks.json");
const launcher = fs.readFileSync(path.join(root, "plugins", "bass", "scripts", "bass-launcher.cjs"), "utf8");

assert.equal(codex.version, pkg.version);
assert.equal(claude.version, pkg.version);
assert.equal(codex.skills, "./skills/");
assert.equal(claude.skills, codex.skills);
assert.equal(codex.hooks, "./hooks/hooks.json");
assert.equal("hooks" in claude, false, "Claude auto-discovers the standard hooks/hooks.json file");
assert.equal(claudeMarket.version, pkg.version);
assert.equal(claudeMarket.plugins[0].version, pkg.version);
assert.equal(codexMarket.version, pkg.version);
assert.equal(codexMarket.plugins[0].version, pkg.version);
assert.equal(codexMarket.plugins[0].source.path, "./plugins/bass");
assert.equal(claudeMarket.plugins[0].source, "./plugins/bass");
assert.ok(hooks.hooks.SessionStart);
assert.ok(hooks.hooks.PostToolUse);
assert.match(hooks.hooks.PostToolUse[0].matcher, /(?:^|\|)Bash(?:\||$)/);
assert.match(launcher, /pluginVersion\(\)/);
assert.match(launcher, /split\(["']\+["'],\s*1\)/);
assert.match(launcher, /process\.env\.npm_execpath/);
assert.match(launcher, /spawnSync\(\s*process\.execPath/);
assert.doesNotMatch(launcher, /npm\.cmd|spawnSync\(\s*["']npm["']/);

const skillsRoot = path.join(root, "plugins", "bass", "skills");
for (const name of fs.readdirSync(skillsRoot)) {
  const skill = fs.readFileSync(path.join(skillsRoot, name, "SKILL.md"), "utf8").replaceAll("\r\n", "\n");
  assert.match(skill, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---`, "s"));
  assert.doesNotMatch(skill, /\[TODO:/);
  assert.match(skill, /\.\.\/\.\.\/scripts\/bass-launcher\.cjs/);
  assert.doesNotMatch(skill, /CLAUDE_PLUGIN_ROOT|PLUGIN_ROOT/);
  assert.doesNotMatch(skill, /`bass\s+[^`]+`/i);
  assert.ok(fs.existsSync(path.join(skillsRoot, name, "agents", "openai.yaml")));
}

console.log(`plugin validation PASS: bass@${pkg.version}`);

function json(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}
