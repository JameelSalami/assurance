#!/usr/bin/env node
/**
 * Independent GitHub checkout -> npm pack lifecycle -> third-party tarball
 * consumer. No sibling checkout and no NODE_PATH manipulation.
 * Running this does not authorize publication.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const info = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const contract = "@durable-systems/contract";
const assurance = "@durable-systems/assurance";
if (![contract, assurance].includes(info.name)) throw Error("unexpected package name");
const isAssurance = info.name === assurance;
if (isAssurance) {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const key = "node_modules/" + contract;
  const registryContract = lock.packages?.[key];
  if (info.devDependencies?.[contract] !== "0.1.0" ||
      info.peerDependencies?.[contract] !== "0.1.0" ||
      lock.packages?.[""]?.devDependencies?.[contract] !== "0.1.0" ||
      typeof registryContract?.resolved !== "string" ||
      !registryContract.resolved.startsWith(
        "https://registry.npmjs.org/@durable-systems/contract/-/") ||
      typeof registryContract.integrity !== "string" ||
      !/^sha512-[A-Za-z0-9+/=]+$/.test(registryContract.integrity)) {
    throw Error("Contract dependency must resolve to integrity-pinned public npm registry package");
  }
}
const scratch = mkdtempSync(join(tmpdir(), "independent-npm-consumer-"));
let passed = false;

function run(bin, args, cwd) {
  const result = spawnSync(bin, args, {
    cwd, encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  });
  if (result.error || result.status !== 0) {
    throw Error([
      "Command: " + [bin, ...args].join(" "),
      "cwd: " + cwd,
      "exit: " + result.status,
      result.error?.message ?? "",
      (result.stdout ?? "").slice(-4000),
      (result.stderr ?? "").slice(-4000),
    ].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}
function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
function assertPack(tgz, name) {
  if (!existsSync(tgz)) throw Error("missing packed tarball: " + tgz);
  const entries = run("tar", ["-tzf", tgz], scratch).split("\n").filter(Boolean);
  const allowed = name === contract
    ? ["package/dist/", "package/contract.json", "package/README.md", "package/LICENSE", "package/package.json"]
    : ["package/dist/", "package/README.md", "package/ASSURANCE.md", "package/LICENSE", "package/package.json"];
  for (const entry of entries) {
    if (!allowed.some((prefix) => entry === prefix || entry.startsWith(prefix))) {
      throw Error("unexpected member in " + name + ": " + entry);
    }
    if (entry.includes("..") || entry.includes("\\\\") || entry.startsWith("/")) {
      throw Error("unsafe tar member: " + entry);
    }
  }
  for (const required of ["package/package.json", "package/README.md", "package/LICENSE", "package/dist/index.js", "package/dist/index.d.ts"]) {
    if (!entries.includes(required)) throw Error(name + " missing tar member: " + required);
  }
  const packed = JSON.parse(run("tar", ["-xOzf", tgz, "package/package.json"], scratch));
  if (packed.name !== name || packed.version !== "0.1.0") throw Error("incorrect packed npm identity");
  if (name === assurance && (
    packed.peerDependencies?.[contract] !== "0.1.0" ||
    Object.keys(packed.peerDependencies ?? {}).some((v) => v === "contract")
  )) throw Error("invalid Assurance peer dependency");
  console.log("PACK " + name + " entries=" + entries.length + " sha256=" + sha256(tgz));
  console.log("MANIFEST " + name + " " + JSON.stringify(entries));
}
const contractTs = `import {
  canonicalDigest, contentDigest, compileExtensionManifest,
  type ExtensionManifest,
} from "@durable-systems/contract";
const result = canonicalDigest({ a: 1, b: 2 });
if (result._tag !== "Digest") throw Error(result.reason);
const bytes: string = contentDigest("hello");
if (!bytes.startsWith("sha256:")) throw Error("content digest");
const entry = compileExtensionManifest({
  schema: "contract.extension-manifest/v1", id: "smoke",
  version: "0.1.0", foundation: "assurance",
  interface: { id: "gate", version: "1" },
  capabilities: ["inspect"], requiredChecks: ["smoke"],
  configurationSchemaDigest: null, authority: "none"
});
if (entry._tag !== "ExtensionManifest") throw Error(entry.reason);
const manifest: ExtensionManifest = entry.manifest;
if (!manifest.digest.startsWith("sha256:")) throw Error("manifest");
`;
const assuranceTs = `import {
  canonicalDigest, compileExtensionManifest, type ExtensionManifest,
} from "@durable-systems/contract";
import {
  createDomainDigest, qualifyExtension, createAssuranceKernel,
  type ExtensionCheckReceipt, type ExtensionQualification,
} from "@durable-systems/assurance";
const canonical = canonicalDigest({ b: 2, a: 1 });
if (canonical._tag !== "Digest") throw Error(canonical.reason);
const domain = createDomainDigest("consumer");
if (domain("test", { a: 1 }).length !== 64) throw Error("domain");
if (typeof createAssuranceKernel !== "function") throw Error("kernel export");
const compiled = compileExtensionManifest({
  schema: "contract.extension-manifest/v1", id: "consumer.adapter",
  version: "0.1.0", foundation: "assurance",
  interface: { id: "gate", version: "1" },
  capabilities: ["inspect"], requiredChecks: ["smoke"],
  configurationSchemaDigest: null, authority: "none"
});
if (compiled._tag !== "ExtensionManifest") throw Error(compiled.reason);
const manifest: ExtensionManifest = compiled.manifest;
const receipt: ExtensionCheckReceipt = {
  schema: "assurance.extension-check/v1", manifestDigest: manifest.digest,
  checkId: "smoke", checkerDigest: manifest.digest,
  evidenceDigest: manifest.digest, disposition: "passed", authority: "none",
};
const qualification: ExtensionQualification = qualifyExtension(
  manifest, [receipt], () => true
);
if (qualification.status !== "passed") throw Error("qualification");
`;
const contractJs = `import { canonicalDigest, contentDigest, compileExtensionManifest } from "@durable-systems/contract";
const result = canonicalDigest({ a: 1, b: 2 });
if (result._tag !== "Digest") throw Error("digest");
if (!contentDigest("hello").startsWith("sha256:")) throw Error("content");
const manifest = compileExtensionManifest({
  schema: "contract.extension-manifest/v1", id: "smoke",
  version: "0.1.0", foundation: "assurance",
  interface: { id: "gate", version: "1" },
  capabilities: ["inspect"], requiredChecks: ["smoke"],
  configurationSchemaDigest: null, authority: "none"
});
if (manifest._tag !== "ExtensionManifest") throw Error("manifest");
`;
const assuranceJs = `import { canonicalDigest, compileExtensionManifest } from "@durable-systems/contract";
import { createDomainDigest, qualifyExtension, createAssuranceKernel } from "@durable-systems/assurance";
if (canonicalDigest({a:1})._tag !== "Digest") throw Error("contract");
if (createDomainDigest("consumer")("smoke", {a:1}).length !== 64) throw Error("assurance");
if (typeof createAssuranceKernel !== "function") throw Error("kernel");
const compiled = compileExtensionManifest({
  schema: "contract.extension-manifest/v1", id: "smoke",
  version: "0.1.0", foundation: "assurance",
  interface: { id: "gate", version: "1" },
  capabilities: ["inspect"], requiredChecks: ["smoke"],
  configurationSchemaDigest: null, authority: "none"
});
if (compiled._tag !== "ExtensionManifest") throw Error("manifest");
const m = compiled.manifest;
const qualified = qualifyExtension(m, [{
  schema: "assurance.extension-check/v1", manifestDigest: m.digest,
  checkId: "smoke", checkerDigest: m.digest, evidenceDigest: m.digest,
  disposition: "passed", authority: "none",
}], () => true);
if (qualified.status !== "passed") throw Error("qualification");
`;
try {
  const packedName = run("npm", ["pack", "--silent", "--ignore-scripts=false", "--pack-destination", scratch], root)
    .split("\n").at(-1);
  if (!packedName?.endsWith(".tgz")) throw Error("npm pack did not return tarball");
  const candidateTar = join(scratch, basename(packedName));
  assertPack(candidateTar, info.name);
  const contractToInstall = isAssurance
    ? "@durable-systems/contract@0.1.0"
    : candidateTar;
  const consumer = join(scratch, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({
    name: "unrelated-third-party-consumer", version: "1.0.0",
    private: true, type: "module",
  }, null, 2) + "\n");
  const toInstall = isAssurance ? [contractToInstall, candidateTar] : [candidateTar];
  run("npm", [
    "install", "--ignore-scripts", "--no-audit", "--no-fund",
    "--save-exact", ...toInstall, "typescript@5.9.3",
  ], consumer);
  const installedContract = join(consumer, "node_modules", "@durable-systems", "contract");
  if (!existsSync(installedContract) || lstatSync(installedContract).isSymbolicLink()) {
    throw Error("Contract installed from a symlink or is missing");
  }
  if (isAssurance) {
    const installedAssurance = join(consumer, "node_modules", "@durable-systems", "assurance");
    if (!existsSync(installedAssurance) || lstatSync(installedAssurance).isSymbolicLink()) {
      throw Error("Assurance installed from a symlink or is missing");
    }
  }
  const contractVersion = JSON.parse(readFileSync(join(installedContract, "package.json"), "utf8"));
  if (contractVersion.name !== contract || contractVersion.version !== "0.1.0") throw Error("Contract identity mismatch");
  if (isAssurance) {
    const assuranceVersion = JSON.parse(readFileSync(join(consumer, "node_modules/@durable-systems/assurance/package.json"), "utf8"));
    if (assuranceVersion.peerDependencies?.[contract] !== "0.1.0") throw Error("unmet Contract peer");
  }
  console.log("DEPENDENCY TREE\n" + run("npm", ["ls", "--all", "--depth=0"], consumer));
  writeFileSync(join(consumer, "smoke.mjs"), isAssurance ? assuranceJs : contractJs);
  writeFileSync(join(consumer, "smoke.mts"), isAssurance ? assuranceTs : contractTs);
  run(process.execPath, ["smoke.mjs"], consumer);
  run(join(consumer, "node_modules/.bin/tsc"), [
    "--noEmit", "--strict", "--target", "ES2023",
    "--module", "NodeNext", "--moduleResolution", "NodeNext", "smoke.mts",
  ], consumer);
  console.log("PASS: unrelated consumer installs actual release tarballs, resolves peer, imports ESM, and typechecks declarations");
  passed = true;
} finally {
  if (passed && process.env.KEEP_RELEASE_CONSUMER !== "1") {
    rmSync(scratch, { recursive: true, force: true });
  } else {
    console.error("Inspection files: " + scratch);
  }
}
