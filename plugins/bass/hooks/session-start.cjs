const message = "BASS 0.5: run `agent guide --json`, obey its plan fingerprint, graph, scope, gates, and evidence contract, and claim only named providers confirmed active for this host.";
const output = process.env.PLUGIN_DATA
  ? { systemMessage: "BASS:READY", hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message } }
  : message;
process.stdout.write(typeof output === "string" ? output : JSON.stringify(output));
