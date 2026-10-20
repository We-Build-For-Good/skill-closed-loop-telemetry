// Loads telemetry only after the user opts in. Demo only.
const SERVICE = "otel-service-sample";
if (localStorage.getItem("user_analytics_consent") === "granted") {
  console.log(`telemetry enabled for ${SERVICE}`);
}
