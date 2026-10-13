import type {
  AssuranceContract,
  AssuranceProblem,
  BasisRow,
  Blocker,
  LawBinding,
  MutationBinding,
  RepresentationMapping,
  StageBinding,
} from "./types.js";
import type { DomainDigest } from "./types.js";

export interface AssuranceDefinition {
  readonly schema: "assurance.definition/v1";
  readonly representations: readonly RepresentationMapping[];
  readonly laws: readonly LawBinding[];
  readonly mutations: readonly MutationBinding[];
  readonly basisRows: readonly BasisRow[];
  readonly ownedStages: readonly StageBinding[];
  readonly deferredStages: readonly StageBinding[];
  readonly blockers: readonly Blocker[];
  readonly authority: "none";
}

export type AssuranceDefinitionResult =
  | {
      readonly _tag: "AssuranceDefinition";
      readonly definition: AssuranceDefinition;
      readonly problem: AssuranceProblem;
      readonly contract: AssuranceContract;
    }
  | {
      readonly _tag: "Refusal";
      readonly reason:
        | "invalid-assurance-definition"
        | "duplicate-assurance-identity"
        | "unresolved-assurance-reference";
    };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function strings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function sourceRef(value: unknown): value is { readonly object: string; readonly clause: string } {
  const v = record(value);
  return v !== null && nonEmpty(v.object) && nonEmpty(v.clause);
}

function parseRepresentation(value: unknown): RepresentationMapping | null {
  const v = record(value);
  if (
    v === null ||
    !sourceRef(v.source) ||
    !nonEmpty(v.status) ||
    typeof v.ready !== "boolean" ||
    !strings(v.evidenceIds)
  ) return null;
  return {
    source: v.source,
    status: v.status,
    ready: v.ready,
    evidenceIds: [...v.evidenceIds],
  };
}

function parseLaw(value: unknown): LawBinding | null {
  const v = record(value);
  if (
    v === null ||
    !nonEmpty(v.id) ||
    !sourceRef(v.source) ||
    !nonEmpty(v.status) ||
    !nonEmpty(v.faultModelBinding) ||
    !strings(v.mutationIds) ||
    !strings(v.verificationRows)
  ) return null;
  return {
    id: v.id,
    source: v.source,
    status: v.status,
    faultModelBinding: v.faultModelBinding,
    mutationIds: [...v.mutationIds],
    verificationRows: [...v.verificationRows],
  };
}

function parseMutation(value: unknown): MutationBinding | null {
  const v = record(value);
  if (
    v === null ||
    !nonEmpty(v.id) ||
    !sourceRef(v.source) ||
    !nonEmpty(v.operator) ||
    !nonEmpty(v.equivalence) ||
    !strings(v.expectedKillers) ||
    !Array.isArray(v.concreteKillers) ||
    v.concreteKillers.length === 0 ||
    typeof v.fullyOwnedKiller !== "boolean"
  ) return null;

  const concreteKillers = [];
  for (const raw of v.concreteKillers) {
    const killer = record(raw);
    if (
      killer === null ||
      !nonEmpty(killer.caseId) ||
      typeof killer.fullyOwned !== "boolean" ||
      !Array.isArray(killer.stages) ||
      killer.stages.length === 0
    ) return null;
    const stages = [];
    for (const rawStage of killer.stages) {
      const stage = record(rawStage);
      if (
        stage === null ||
        !strings(stage.owners) ||
        stage.owners.length === 0 ||
        !nonEmpty(stage.procedure) ||
        !Number.isSafeInteger(stage.procedureIndex)
      ) return null;
      stages.push({
        owners: [...stage.owners],
        procedure: stage.procedure,
        procedureIndex: stage.procedureIndex as number,
      });
    }
    concreteKillers.push({
      caseId: killer.caseId,
      fullyOwned: killer.fullyOwned,
      stages,
    });
  }

  return {
    id: v.id,
    source: v.source,
    operator: v.operator,
    equivalence: v.equivalence,
    expectedKillers: [...v.expectedKillers],
    concreteKillers,
    fullyOwnedKiller: v.fullyOwnedKiller,
  };
}

function parseBasisRow(value: unknown): BasisRow | null {
  const v = record(value);
  if (
    v === null ||
    !nonEmpty(v.id) ||
    !nonEmpty(v.kind) ||
    !strings(v.suites) ||
    !strings(v.verificationClasses)
  ) return null;
  return {
    id: v.id,
    kind: v.kind,
    suites: [...v.suites],
    verificationClasses: [...v.verificationClasses],
  };
}

function parseStage(value: unknown): StageBinding | null {
  const v = record(value);
  if (
    v === null ||
    !nonEmpty(v.id) ||
    !nonEmpty(v.caseId) ||
    !Number.isSafeInteger(v.procedureIndex) ||
    !nonEmpty(v.procedure) ||
    !nonEmpty(v.allocation) ||
    !strings(v.owners) ||
    !Array.isArray(v.sources) ||
    !v.sources.every(sourceRef) ||
    !strings(v.formalProperties)
  ) return null;
  return {
    id: v.id,
    caseId: v.caseId,
    procedureIndex: v.procedureIndex as number,
    procedure: v.procedure,
    allocation: v.allocation,
    owners: [...v.owners],
    sources: [...v.sources],
    formalProperties: [...v.formalProperties],
  };
}

function parseBlocker(value: unknown): Blocker | null {
  const v = record(value);
  if (
    v === null ||
    (v.gate !== "G-REP" && v.gate !== "G-LAW" && v.gate !== "other") ||
    !nonEmpty(v.source) ||
    !nonEmpty(v.reason)
  ) return null;
  return { gate: v.gate, source: v.source, reason: v.reason };
}

function duplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function sourceId(source: { readonly object: string; readonly clause: string }): string {
  return source.object + ":" + source.clause;
}

export function compileAssuranceDefinition(
  input: unknown,
  domainDigest: DomainDigest,
): AssuranceDefinitionResult {
  const value = record(input);
  if (
    value === null ||
    value.schema !== "assurance.definition/v1" ||
    value.authority !== "none" ||
    !Array.isArray(value.representations) ||
    !Array.isArray(value.laws) ||
    !Array.isArray(value.mutations) ||
    !Array.isArray(value.basisRows) ||
    !Array.isArray(value.ownedStages) ||
    !Array.isArray(value.deferredStages) ||
    !Array.isArray(value.blockers)
  ) return { _tag: "Refusal", reason: "invalid-assurance-definition" };

  const representations = value.representations.map(parseRepresentation);
  const laws = value.laws.map(parseLaw);
  const mutations = value.mutations.map(parseMutation);
  const basisRows = value.basisRows.map(parseBasisRow);
  const ownedStages = value.ownedStages.map(parseStage);
  const deferredStages = value.deferredStages.map(parseStage);
  const blockers = value.blockers.map(parseBlocker);

  if (
    representations.some((item) => item === null) ||
    laws.some((item) => item === null) ||
    mutations.some((item) => item === null) ||
    basisRows.some((item) => item === null) ||
    ownedStages.some((item) => item === null) ||
    deferredStages.some((item) => item === null) ||
    blockers.some((item) => item === null)
  ) return { _tag: "Refusal", reason: "invalid-assurance-definition" };

  const typedRepresentations = representations as RepresentationMapping[];
  const typedLaws = laws as LawBinding[];
  const typedMutations = mutations as MutationBinding[];
  const typedRows = basisRows as BasisRow[];
  const typedOwned = ownedStages as StageBinding[];
  const typedDeferred = deferredStages as StageBinding[];
  const typedBlockers = blockers as Blocker[];

  if (
    duplicate(typedRepresentations.map((item) => sourceId(item.source))) ||
    duplicate(typedLaws.map((item) => item.id)) ||
    duplicate(typedMutations.map((item) => item.id)) ||
    duplicate(typedRows.map((item) => item.kind + ":" + item.id)) ||
    duplicate([...typedOwned, ...typedDeferred].map((item) => item.id))
  ) return { _tag: "Refusal", reason: "duplicate-assurance-identity" };

  const mutationIds = new Set(typedMutations.map((item) => item.id));
  const verificationRows = new Set(typedRows.map((item) => item.kind + ":" + item.id));
  const stageIds = new Set([...typedOwned, ...typedDeferred].map((item) => item.id));

  for (const law of typedLaws) {
    if (
      law.mutationIds.some((id) => !mutationIds.has(id)) ||
      law.verificationRows.some((id) => !verificationRows.has(id))
    ) return { _tag: "Refusal", reason: "unresolved-assurance-reference" };
  }
  for (const mutation of typedMutations) {
    if (mutation.expectedKillers.some((id) => !stageIds.has(id))) {
      return { _tag: "Refusal", reason: "unresolved-assurance-reference" };
    }
  }

  const definition: AssuranceDefinition = Object.freeze({
    schema: "assurance.definition/v1",
    representations: Object.freeze(typedRepresentations),
    laws: Object.freeze(typedLaws),
    mutations: Object.freeze(typedMutations),
    basisRows: Object.freeze(typedRows),
    ownedStages: Object.freeze(typedOwned),
    deferredStages: Object.freeze(typedDeferred),
    blockers: Object.freeze(typedBlockers),
    authority: "none",
  });

  const problem: AssuranceProblem = Object.freeze({
    readiness: Object.freeze({
      gRepresentation: typedRepresentations.every((item) => item.ready) ? "passed" : "blocked",
      gLaw: typedBlockers.some((item) => item.gate === "G-LAW") ? "blocked" : "passed",
    }),
    representationMappings: definition.representations,
    laws: definition.laws,
    mutations: definition.mutations,
    basisRows: definition.basisRows,
    blockers: definition.blockers,
  });

  const semantic = Object.freeze({
    laws: definition.laws,
    mutations: definition.mutations,
    ownedStages: definition.ownedStages,
    deferredStages: definition.deferredStages,
    basisRows: definition.basisRows,
  });
  const contract: AssuranceContract = Object.freeze({
    digest: domainDigest("assurance-contract.v1", semantic),
    semantic,
  });

  return { _tag: "AssuranceDefinition", definition, problem, contract };
}
