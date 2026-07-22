import type {
  CodingWorkflowOrchestration,
  ContractSnapshot,
  ContractUpdate,
  InterfaceContract
} from "@graphcode/graph-model";

export type ProposedContractUpdate = ContractUpdate & {
  workUnitId: string;
};

export type ContractReconciliationIssue = {
  code:
    | "unknown_contract"
    | "unauthorized_contract_update"
    | "invalid_contract_edge"
    | "conflicting_contract_updates"
    | "contract_change_unacknowledged";
  contractId: string;
  message: string;
  producerWorkUnitId: string | null;
  consumerWorkUnitId: string | null;
  workUnitIds: string[];
};

export type ContractReconciliationResult = {
  passed: boolean;
  contracts: InterfaceContract[];
  issues: ContractReconciliationIssue[];
  blockedWorkUnitIds: string[];
};

export function reconcileInterfaceContracts(
  orchestration: CodingWorkflowOrchestration,
  updates: ProposedContractUpdate[]
): ContractReconciliationResult {
  const issues: ContractReconciliationIssue[] = [];
  const blocked = new Set<string>();
  const contractById = new Map(orchestration.interfaceContracts.map((contract) => [contract.id, contract]));
  const edgeById = new Map(orchestration.boundaryEdges.map((edge) => [edge.id, edge]));
  const unitById = new Map(orchestration.workUnits.map((unit) => [unit.id, unit]));
  const updatesByContract = new Map<string, ProposedContractUpdate[]>();

  for (const update of updates) {
    const contract = contractById.get(update.contractId);
    if (!contract) {
      issues.push({
        code: "unknown_contract",
        contractId: update.contractId,
        message: `Work unit ${update.workUnitId} proposed an update to unknown contract ${update.contractId}.`,
        producerWorkUnitId: null,
        consumerWorkUnitId: null,
        workUnitIds: [update.workUnitId]
      });
      blocked.add(update.workUnitId);
      continue;
    }
    if (update.workUnitId !== contract.producerWorkUnitId && update.workUnitId !== contract.consumerWorkUnitId) {
      issues.push({
        code: "unauthorized_contract_update",
        contractId: contract.id,
        message: `Work unit ${update.workUnitId} is not an endpoint of contract ${contract.id}.`,
        producerWorkUnitId: contract.producerWorkUnitId,
        consumerWorkUnitId: contract.consumerWorkUnitId,
        workUnitIds: [update.workUnitId, contract.producerWorkUnitId, contract.consumerWorkUnitId]
      });
      blocked.add(update.workUnitId);
      blocked.add(contract.consumerWorkUnitId);
      continue;
    }
    const grouped = updatesByContract.get(contract.id) ?? [];
    grouped.push(update);
    updatesByContract.set(contract.id, grouped);
  }

  const contracts = orchestration.interfaceContracts.map((contract) => {
    if (!contractEdgeResolves(contract, edgeById, unitById)) {
      issues.push({
        code: "invalid_contract_edge",
        contractId: contract.id,
        message: `Contract ${contract.id} does not resolve to a boundary edge crossing producer ${contract.producerWorkUnitId} and consumer ${contract.consumerWorkUnitId}.`,
        producerWorkUnitId: contract.producerWorkUnitId,
        consumerWorkUnitId: contract.consumerWorkUnitId,
        workUnitIds: [contract.producerWorkUnitId, contract.consumerWorkUnitId]
      });
      blocked.add(contract.producerWorkUnitId);
      blocked.add(contract.consumerWorkUnitId);
      return { ...contract, status: "invalid" as const };
    }

    const proposedUpdates = updatesByContract.get(contract.id) ?? [];
    if (proposedUpdates.length === 0) {
      if (contract.status === "proposed_change" || contract.status === "conflicted" || contract.status === "invalid") {
        issues.push({
          code: contract.status === "conflicted" ? "conflicting_contract_updates" : "contract_change_unacknowledged",
          contractId: contract.id,
          message: `Contract ${contract.id} remains ${contract.status}; consumer ${contract.consumerWorkUnitId} cannot proceed without reconciliation.`,
          producerWorkUnitId: contract.producerWorkUnitId,
          consumerWorkUnitId: contract.consumerWorkUnitId,
          workUnitIds: [contract.producerWorkUnitId, contract.consumerWorkUnitId]
        });
        blocked.add(contract.consumerWorkUnitId);
      }
      return contract;
    }
    const first = proposedUpdates[0].proposed;
    const incompatible = proposedUpdates.some((update) => !sameContractSnapshot(first, update.proposed));
    if (incompatible) {
      const updateUnits = [...new Set(proposedUpdates.map((update) => update.workUnitId))].sort();
      issues.push({
        code: "conflicting_contract_updates",
        contractId: contract.id,
        message: `Contract ${contract.id} has incompatible proposed values from ${updateUnits.join(", ")}; producer ${contract.producerWorkUnitId} and consumer ${contract.consumerWorkUnitId} must reconcile.`,
        producerWorkUnitId: contract.producerWorkUnitId,
        consumerWorkUnitId: contract.consumerWorkUnitId,
        workUnitIds: [...new Set([...updateUnits, contract.producerWorkUnitId, contract.consumerWorkUnitId])]
      });
      blocked.add(contract.producerWorkUnitId);
      blocked.add(contract.consumerWorkUnitId);
      return { ...contract, proposed: first, status: "conflicted" as const };
    }

    if (sameContractSnapshot(contract.baseline, first)) {
      return { ...contract, proposed: first, status: "accepted" as const };
    }

    const acknowledgingUnits = new Set(proposedUpdates.map((update) => update.workUnitId));
    if (
      contract.status === "proposed_change" &&
      contract.proposed &&
      sameContractSnapshot(contract.proposed, first) &&
      acknowledgingUnits.has(contract.consumerWorkUnitId)
    ) {
      return { ...contract, proposed: first, status: "accepted" as const };
    }
    const mutuallyAcknowledged =
      acknowledgingUnits.has(contract.producerWorkUnitId) && acknowledgingUnits.has(contract.consumerWorkUnitId);
    if (mutuallyAcknowledged) {
      return { ...contract, proposed: first, status: "accepted" as const };
    }

    issues.push({
      code: "contract_change_unacknowledged",
      contractId: contract.id,
      message: `Contract ${contract.id} changes from its baseline but is not acknowledged by both producer ${contract.producerWorkUnitId} and consumer ${contract.consumerWorkUnitId}.`,
      producerWorkUnitId: contract.producerWorkUnitId,
      consumerWorkUnitId: contract.consumerWorkUnitId,
      workUnitIds: [contract.producerWorkUnitId, contract.consumerWorkUnitId]
    });
    blocked.add(contract.consumerWorkUnitId);
    return { ...contract, proposed: first, status: "proposed_change" as const };
  });

  return {
    passed: issues.length === 0,
    contracts,
    issues,
    blockedWorkUnitIds: [...blocked].sort()
  };
}

function sameContractSnapshot(left: ContractSnapshot, right: ContractSnapshot): boolean {
  return left.formatVersion === right.formatVersion && left.fingerprint === right.fingerprint && left.normalizedValue === right.normalizedValue;
}

function contractEdgeResolves(
  contract: InterfaceContract,
  edgeById: Map<string, CodingWorkflowOrchestration["boundaryEdges"][number]>,
  unitById: Map<string, CodingWorkflowOrchestration["workUnits"][number]>
): boolean {
  const edge = edgeById.get(contract.edgeId);
  const producer = unitById.get(contract.producerWorkUnitId);
  const consumer = unitById.get(contract.consumerWorkUnitId);
  if (!edge || !producer || !consumer || edge.kind !== contract.edgeKind) return false;
  const producerNodes = new Set(producer.ownedNodeIds);
  const consumerNodes = new Set(consumer.ownedNodeIds);
  return (
    (producerNodes.has(edge.sourceNodeId) && consumerNodes.has(edge.targetNodeId)) ||
    (producerNodes.has(edge.targetNodeId) && consumerNodes.has(edge.sourceNodeId))
  );
}
