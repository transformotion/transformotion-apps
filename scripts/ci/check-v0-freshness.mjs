#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const uiImpactPatterns = [
  /^apps\/[^/]+\/app\//,
  /^apps\/[^/]+\/components\//,
  /^apps\/[^/]+\/lib\//,
  /^apps\/[^/]+\/stores\//,
  /^apps\/[^/]+\/hooks\//,
  /^apps\/[^/]+\/services\//,
  /^apps\/[^/]+\/data\//,
  /^apps\/[^/]+\/next\.config\.[cm]?js$/,
  /^apps\/[^/]+\/package\.json$/,
  /^apps\/[^/]+\/\.env\.example$/,
  /^apps\/[^/]+\/tsconfig\.json$/,
  /^packages\/ui\//,
  /^packages\/contracts\//,
  /^packages\/api-client\//,
  /^packages\/auth-client\//,
  /^packages\/runtime-config\//,
  /^packages\/budget-domain\//,
  /^contracts\//,
];

const nonUiExamples = [
  "backend-only Lambda internals with no UI or contract shape change",
  "infrastructure-only deploy role changes",
  "documentation-only changes",
  "CI-only changes",
];

function readChangedFiles() {
  if (process.env.CHANGED_FILES_FILE) {
    return readFileSync(process.env.CHANGED_FILES_FILE, "utf8");
  }

  if (process.env.CHANGED_FILES) {
    return process.env.CHANGED_FILES;
  }

  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    execSync(`git fetch origin ${shellQuote(baseRef)} --depth=1`, {
      stdio: "inherit",
    });
    return execSync(`git diff --name-only origin/${shellQuote(baseRef)}...HEAD`, {
      encoding: "utf8",
    });
  }

  return execSync("git diff --name-only HEAD~1...HEAD", { encoding: "utf8" });
}

function readPrBody() {
  if (process.env.PR_BODY_FILE && existsSync(process.env.PR_BODY_FILE)) {
    return readFileSync(process.env.PR_BODY_FILE, "utf8");
  }

  return process.env.PR_BODY ?? "";
}

function shellQuote(value) {
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
    throw new Error(`Unsafe ref value: ${value}`);
  }
  return value;
}

function isUiImpactingPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return uiImpactPatterns.some((pattern) => pattern.test(normalized));
}

function hasLinkedV0Reference(section) {
  return /transformotion-apps-b8\/(?:pull|commit)\/[A-Za-z0-9._/-]+/i.test(
    section,
  );
}

function hasNoImpactReason(section) {
  const selectedNoImpact =
    /-\s*\[[xX]\]\s*No v0 impact/i.test(section) ||
    /No v0 impact\s*:\s*(?!\s*$).+/i.test(section);

  if (!selectedNoImpact) {
    return false;
  }

  const reasonMatch = section.match(/Reason[^:\n]*:\s*([\s\S]+)/i);
  return Boolean(reasonMatch && reasonMatch[1].trim().length >= 10);
}

function getV0Section(body) {
  const match = body.match(/(^|\n)##\s+v0 freshness\s*\n([\s\S]*?)(?=\n##\s+|\s*$)/i);
  return match?.[2] ?? "";
}

const changedFiles = readChangedFiles()
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const impactingFiles = changedFiles.filter(isUiImpactingPath);

if (impactingFiles.length === 0) {
  console.log("OK: no UI-affecting or contract-affecting paths changed.");
  process.exit(0);
}

const prBody = readPrBody();
const v0Section = getV0Section(prBody);

if (
  v0Section &&
  (hasLinkedV0Reference(v0Section) || hasNoImpactReason(v0Section))
) {
  console.log("OK: v0 freshness declaration found for impacted paths.");
  console.log("Impacted paths:");
  for (const file of impactingFiles) {
    console.log(`- ${file}`);
  }
  process.exit(0);
}

console.error("ERROR: v0 freshness declaration is required.");
console.error("");
console.error("These paths are UI-affecting or contract-affecting:");
for (const file of impactingFiles) {
  console.error(`- ${file}`);
}
console.error("");
console.error("Add a PR body section named '## v0 freshness' with either:");
console.error("- a link to the matching transformotion-apps-b8 PR/commit, or");
console.error("- 'No v0 impact' selected plus a clear reason.");
console.error("");
console.error("Non-UI examples that usually do not require v0 work:");
for (const example of nonUiExamples) {
  console.error(`- ${example}`);
}

process.exit(1);

