const message = "BASS 0.3 is available. When bass.yaml exists, run the plugin launcher with `agent guide --json`, obey its scope lock and loop limit, and load optional skills only when execution_plan.capabilityCalls names them.";

if (process.env.PLUGIN_DATA) {
  process.stdout.write(JSON.stringify({
    systemMessage: "BASS:READY",
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
  }));
} else {
  process.stdout.write(message);
}
