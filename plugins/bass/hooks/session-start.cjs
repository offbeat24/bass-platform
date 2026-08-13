const message = "BASS 0.4: run `agent guide --json`, obey its graph, scope, and bounded loop, and use only named providers confirmed by doctor and the host.";
const output = process.env.PLUGIN_DATA
  ? { systemMessage: "BASS:READY", hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message } }
  : message;
process.stdout.write(typeof output === "string" ? output : JSON.stringify(output));
