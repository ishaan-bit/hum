import http from "node:http";

const QA_URL = "http://localhost:3001";
const OK_STATUSES = new Set([200, 301, 302]);

const request = http.get(QA_URL, { timeout: 5000 }, (response) => {
  const { statusCode } = response;

  response.resume();

  if (OK_STATUSES.has(statusCode)) {
    console.log(`QA server is responding at ${QA_URL} with HTTP ${statusCode}.`);
    process.exit(0);
  }

  console.error(
    `QA server responded at ${QA_URL}, but returned HTTP ${statusCode}. Expected 200, 301, or 302.`,
  );
  process.exit(1);
});

request.on("timeout", () => {
  request.destroy(new Error(`Timed out waiting for ${QA_URL}.`));
});

request.on("error", (error) => {
  console.error(`Could not reach the QA server at ${QA_URL}.`);
  console.error("Start it with: npm run qa:start");
  console.error(`Details: ${formatError(error)}`);
  process.exit(1);
});

function formatError(error) {
  if (error.message) {
    return error.message;
  }

  if (error.code) {
    return error.code;
  }

  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors
      .map((nestedError) => nestedError.message || nestedError.code)
      .filter(Boolean)
      .join("; ");
  }

  return "Unknown connection error.";
}
