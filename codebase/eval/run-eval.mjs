import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const evalDirectory = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.join(evalDirectory, "golden-set.json");

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const endpoint = argument(
  "endpoint",
  process.env.RESOLVER_ENDPOINT ?? "http://localhost:3000/api/resolve",
);
const label = argument("label", "manual");
const outputName = argument(
  "output",
  `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
const allowFail = process.argv.includes("--allow-fail");

const golden = JSON.parse(await readFile(goldenPath, "utf8"));

async function evaluateCase(testCase) {
  const startedAt = Date.now();
  let response;
  let payload;
  let requestError = null;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: testCase.question }),
      signal: AbortSignal.timeout(45_000),
    });
    payload = await response.json();
  } catch (error) {
    requestError = error instanceof Error ? error.message : String(error);
  }

  if (!payload) {
    return {
      ...testCase,
      pass: false,
      checks: {
        http_ok: false,
        status_match: false,
        retrieval_hit: false,
        required_sources_present: false,
        source_integrity: false,
      },
      actual: null,
      request_error: requestError,
      latency_ms: Date.now() - startedAt,
    };
  }

  const retrievedIds = (payload.trace?.retrieved ?? []).map(
    (item) => item.threadId,
  );
  const returnedSourceIds = (payload.sources ?? []).map((item) => item.id);
  const validatedSourceIds = payload.trace?.validatedSourceIds ?? [];
  const rejectedSourceIds = payload.trace?.rejectedSourceIds ?? [];
  const retrievalHit =
    testCase.expected_thread_ids.length === 0 ||
    testCase.expected_thread_ids.some((id) => retrievedIds.includes(id));
  const requiredSourcesPresent =
    testCase.required_source_ids.length === 0 ||
    testCase.required_source_ids.every((id) => returnedSourceIds.includes(id));
  const sourceIntegrity =
    rejectedSourceIds.length === 0 &&
    returnedSourceIds.every((id) => validatedSourceIds.includes(id)) &&
    (payload.status !== "resolved" || returnedSourceIds.length > 0);
  const checks = {
    http_ok: response.ok,
    status_match: payload.status === testCase.expected_status,
    retrieval_hit: retrievalHit,
    required_sources_present: requiredSourcesPresent,
    source_integrity: sourceIntegrity,
  };

  return {
    ...testCase,
    pass: Object.values(checks).every(Boolean),
    checks,
    actual: {
      status: payload.status,
      understood_as: payload.understoodAs,
      source_ids: returnedSourceIds,
      retrieved_thread_ids: retrievedIds,
      trace_mode: payload.trace?.mode ?? null,
      confidence: payload.confidence,
    },
    request_error: requestError,
    latency_ms: Date.now() - startedAt,
  };
}

const results = [];
for (const testCase of golden.cases) {
  const result = await evaluateCase(testCase);
  results.push(result);
  const mark = result.pass ? "PASS" : "FAIL";
  console.log(
    `${mark} ${testCase.case_id} expected=${testCase.expected_status} actual=${result.actual?.status ?? "request_error"}`,
  );
}

const groupSummary = Object.fromEntries(
  [...new Set(results.map((item) => item.group))].map((group) => {
    const cases = results.filter((item) => item.group === group);
    const passed = cases.filter((item) => item.pass).length;
    return [
      group,
      {
        passed,
        total: cases.length,
        pass_rate: Number((passed / cases.length).toFixed(4)),
      },
    ];
  }),
);
const passed = results.filter((item) => item.pass).length;
const falseResolvedWithoutSource = results.filter(
  (item) =>
    item.actual?.status === "resolved" &&
    item.actual.source_ids.length === 0,
).length;
const unsafeFalseResolved = results.filter(
  (item) =>
    item.expected_status !== "resolved" &&
    item.actual?.status === "resolved",
).length;
const sourceIntegrityFailures = results.filter(
  (item) => !item.checks.source_integrity,
).length;
const passRate = passed / results.length;
const qualityGatePassed =
  passRate >= 0.8 &&
  falseResolvedWithoutSource === 0 &&
  unsafeFalseResolved === 0 &&
  sourceIntegrityFailures === 0;
const report = {
  run: {
    label,
    created_at: new Date().toISOString(),
    endpoint,
    golden_set: golden.name,
    golden_version: golden.version,
    observed_modes: [...new Set(results.map((item) => item.actual?.trace_mode))],
  },
  summary: {
    passed,
    failed: results.length - passed,
    total: results.length,
    pass_rate: Number(passRate.toFixed(4)),
    false_resolved_without_source: falseResolvedWithoutSource,
    unsafe_false_resolved: unsafeFalseResolved,
    source_integrity_failures: sourceIntegrityFailures,
    quality_gate_passed: qualityGatePassed,
    gate: "pass_rate >= 0.80 AND zero unsafe false-resolved AND zero resolved without valid source AND zero source-integrity failures",
    by_group: groupSummary,
  },
  results,
};

const runsDirectory = path.join(evalDirectory, "runs");
await mkdir(runsDirectory, { recursive: true });
const outputPath = path.join(runsDirectory, outputName);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  `\n${passed}/${results.length} passed (${(passRate * 100).toFixed(1)}%). Quality gate: ${qualityGatePassed ? "PASS" : "FAIL"}`,
);
console.log(`Report: ${outputPath}`);

if (!qualityGatePassed && !allowFail) process.exitCode = 1;
