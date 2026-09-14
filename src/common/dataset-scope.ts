type JsonRecord = Record<string, unknown>

export const allRuntimeModuleIds = [
  'ats', 'emp', 'onb', 'att', 'leave', 'pay', 'ins', 'tax', 'ess',
  'kpi', 'review', 'cmp', 'lnd', 'tal', 'eng',
  'org-hc', 'org-st', 'org-job', 'org-pos', 'org-rpt',
  'plt-md', 'plt-cfg', 'plt-wfl', 'plt-doc', 'plt-sig', 'plt-ntf', 'plt-int', 'plt-sec', 'plt-aud'
] as const

const coreRuntimeModuleIds = ['ats', 'emp', 'onb', 'att', 'leave', 'pay', 'ins', 'tax', 'ess'] as const

const workflowModules: Record<string, string[]> = {
  'LIFE-00': ['ats', 'emp'],
  'LIFE-01': ['ats', 'emp'],
  'LIFE-02': ['emp', 'onb'],
  'LIFE-03': ['emp'],
  'LIFE-04': ['emp'],
  'LIFE-05': ['emp', 'pay'],
  'LIFE-06': ['emp', 'att', 'leave'],
  'LIFE-07': ['emp'],
  'MODULE-ONB': ['onb'],
  'MODULE-ESS': ['ess'],
  'MODULE-ATT': ['att', 'leave'],
  'MODULE-PAY': ['pay'],
  'MODULE-INS': ['ins'],
  'MODULE-TAX': ['tax'],
  'MODULE-MD': [...coreRuntimeModuleIds],
  'MODULE-MD-FUNCTIONS': [...coreRuntimeModuleIds],
  'MODULE-PFM': ['kpi', 'review'],
  'MODULE-CMP': ['cmp'],
  'MODULE-LND': ['lnd'],
  'MODULE-TAL': ['tal'],
  'MODULE-ENG': ['eng'],
  'MODULE-ORG-HC': ['org-hc'],
  'MODULE-ORG-ST': ['org-st'],
  'MODULE-ORG-JOB': ['org-job'],
  'MODULE-ORG-POS': ['org-pos'],
  'MODULE-ORG-RPT': ['org-rpt'],
  'MODULE-PLT-MD': ['plt-md'],
  'MODULE-PLT-CFG': ['plt-cfg'],
  'MODULE-PLT-WFL': ['plt-wfl'],
  'MODULE-PLT-DOC': ['plt-doc'],
  'MODULE-PLT-SIG': ['plt-sig'],
  'MODULE-PLT-NTF': ['plt-ntf'],
  'MODULE-PLT-INT': ['plt-int'],
  'MODULE-PLT-SEC': ['plt-sec'],
  'MODULE-PLT-AUD': ['plt-aud'],
  'CF-01': ['att', 'leave'],
  'CROSS-01': ['att', 'leave'],
  'CF-02': ['emp'],
  'CROSS-02': ['emp'],
  'CF-03': ['emp'],
  'CROSS-03': ['emp'],
  'CF-04': ['emp'],
  'CROSS-04': ['emp'],
  'CF-05': ['emp'],
  'CROSS-05': ['emp'],
  'CF-06': ['emp', 'onb'],
  'CROSS-06': ['emp', 'onb'],
  'CF-07': ['review'],
  'CROSS-07': ['review'],
  'CF-08': ['emp'],
  'CROSS-08': ['emp']
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasVisibleModule(contentKey: string, allowed: Set<string>): boolean {
  const mapped = workflowModules[contentKey]
  return mapped ? mapped.some((moduleId) => allowed.has(moduleId)) : false
}

function modulesForSopCode(rawCode: unknown): string[] {
  const code = String(rawCode ?? '').toUpperCase().replaceAll(' ', '-')
  if (/PFM-?0?2\b/.test(code) || /PFM-?0?3\b/.test(code)) return ['kpi']
  if (code.includes('PFM') || code.includes('ĐG') || code.includes('DG')) return ['review']
  if (code.includes('CMP')) return ['cmp']
  if (code.includes('LND')) return ['lnd']
  if (code.includes('TAL')) return ['tal']
  if (code.includes('ENG')) return ['eng']
  if (code.includes('HC-')) return ['org-hc']
  if (code.includes('OST')) return ['org-st']
  if (code.includes('JOB')) return ['org-job']
  if (code.includes('POS')) return ['org-pos']
  if (code.includes('RPT')) return ['org-rpt']
  if (code.includes('CFG')) return ['plt-cfg']
  if (code.includes('WFL')) return ['plt-wfl']
  if (code.includes('DOC') || code.includes('ADM')) return ['plt-doc']
  if (code.includes('SIG')) return ['plt-sig']
  if (code.includes('NTF')) return ['plt-ntf']
  if (code.includes('INT')) return ['plt-int']
  if (code.includes('SEC')) return ['plt-sec']
  if (code.includes('AUD')) return ['plt-aud']
  if (code.includes('PROM')) return ['emp', 'pay']
  if (code.includes('PAY')) return ['pay']
  if (code.includes('INS') || code.includes('BHXH')) return ['ins']
  if (code.includes('TAX') || code.includes('TNCN')) return ['tax']
  if (code.includes('ATT') || code.includes('LEV') || code.includes('CC-')) return ['att', 'leave']
  if (code.includes('REC') || code.includes('ATS')) return ['ats']
  if (code.includes('ONB')) return ['onb']
  if (code.includes('ESS')) return ['ess']
  if (code.includes('EMP') || code.includes('NS-') || code.includes('OFF')) return ['emp']
  return []
}

function modulesForMasterDataId(rawId: unknown): string[] {
  const id = String(rawId ?? '').toUpperCase()
  if (['MD-01', 'MD-02', 'MD-03'].includes(id)) return []
  if (id === 'MD-04') return ['emp', 'pay', 'ins', 'tax']
  if (id === 'MD-05' || id === 'MD-06' || id === 'MD-10') return ['emp']
  if (id === 'MD-07') return ['pay']
  if (id === 'MD-08') return ['att', 'leave']
  if (id === 'MD-09') return ['ins']
  return []
}

function catalogItemMatchesModules(item: unknown, allowed: Set<string>): boolean {
  if (!isRecord(item)) return false
  const directModule = String(item.moduleId ?? '').toLowerCase()
  if (allowed.has(directModule)) return true
  if (!Array.isArray(item.consumerModules)) return false
  return item.consumerModules.some((consumer) => {
    const code = String(consumer).toLowerCase()
    return (code === 'rec' && allowed.has('ats'))
      || (code === 'lev' && allowed.has('leave'))
      || allowed.has(code)
  })
}

function filterWorkflowProcesses(value: unknown, allowed: Set<string>): unknown[] {
  if (!Array.isArray(value)) return []
  return value.filter((process) => {
    if (!isRecord(process)) return false
    const modules = modulesForSopCode(process.sopCode)
    return modules.length === 0 || modules.some((moduleId) => allowed.has(moduleId))
  })
}

function filterRecord<T>(record: Record<string, T>, predicate: (key: string, value: T) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => predicate(key, value)))
}

function filterConnections(value: unknown, visibleNodeIds: Set<string>): unknown {
  if (!Array.isArray(value)) return value
  return value.filter((item) => {
    if (!isRecord(item)) return false
    const from = String(item.from ?? item.source ?? item.fromModuleId ?? '')
    const to = String(item.to ?? item.target ?? item.toModuleId ?? '')
    return (!from || visibleNodeIds.has(from)) && (!to || visibleNodeIds.has(to))
  })
}

export function scopeRuntimeDatasets(
  datasets: Record<string, unknown>,
  readableModuleIds: string[]
): Record<string, unknown> {
  const allowed = new Set(readableModuleIds)
  if (allRuntimeModuleIds.every((moduleId) => allowed.has(moduleId))) return datasets

  const scoped = structuredClone(datasets)

  const core = scoped['coreOperations.config']
  if (isRecord(core)) {
    const stageMap = isRecord(core.stageMap)
      ? filterRecord(core.stageMap, (moduleId) => allowed.has(moduleId))
      : {}
    const visibleSopCodes = new Set<string>()
    for (const module of Object.values(stageMap)) {
      if (!isRecord(module) || !Array.isArray(module.stages)) continue
      for (const stage of module.stages) {
        if (!isRecord(stage) || !Array.isArray(stage.sopCodes)) continue
        stage.sopCodes.forEach((code) => visibleSopCodes.add(String(code)))
      }
    }
    core.stageMap = stageMap
    if (isRecord(core.workflowBySopCode)) {
      core.workflowBySopCode = filterRecord(core.workflowBySopCode, (sopCode, workflowId) =>
        visibleSopCodes.has(sopCode) || hasVisibleModule(String(workflowId), allowed)
      )
    }
    if (Array.isArray(core.legalReferences)) {
      core.legalReferences = core.legalReferences.filter((reference) =>
        isRecord(reference)
        && Array.isArray(reference.affectedModules)
        && reference.affectedModules.some((moduleId) => allowed.has(String(moduleId)))
      )
    }
  }

  const workflows = scoped['workflow.sopDatabase']
  if (isRecord(workflows)) {
    scoped['workflow.sopDatabase'] = Object.fromEntries(Object.entries(workflows)
      .filter(([workflowId]) => hasVisibleModule(workflowId, allowed))
      // Keep the shared workflow container even when every detailed SOP belongs
      // to another module. Consumers can still render the authorized pipeline
      // frame without receiving restricted SOP definitions.
      .map(([workflowId, processes]) => [workflowId, filterWorkflowProcesses(processes, allowed)]))
  }

  const dictionary = scoped['sop.dictionary']
  if (isRecord(dictionary)) {
    scoped['sop.dictionary'] = filterRecord(dictionary, (contentId) =>
      (contentId.startsWith('MD-') && modulesForMasterDataId(contentId).some((moduleId) => allowed.has(moduleId)))
      || hasVisibleModule(contentId, allowed)
    )
  }

  const crossRegistry = scoped['crossFunctional.registry']
  if (isRecord(crossRegistry)) {
    scoped['crossFunctional.registry'] = filterRecord(crossRegistry, (contentId) => hasVisibleModule(contentId, allowed))
  }

  const page = scoped['page.businessNodes']
  if (isRecord(page)) {
    const lifecycleProcesses = Array.isArray(page.lifecycleProcesses)
      ? page.lifecycleProcesses.filter((item) => isRecord(item) && hasVisibleModule(String(item.id), allowed))
      : []
    const crossFunctionalProcesses = Array.isArray(page.crossFunctionalProcesses)
      ? page.crossFunctionalProcesses.filter((item) => isRecord(item) && hasVisibleModule(String(item.id), allowed))
      : []
    const sharedServices = allowed.has('ess') && Array.isArray(page.sharedServices) ? page.sharedServices : []
    const masterData = Array.isArray(page.masterData)
      ? page.masterData.filter((item) => isRecord(item)
        && (() => {
          const modules = modulesForMasterDataId(item.id)
          return modules.length === 0 || modules.some((moduleId) => allowed.has(moduleId))
        })())
      : []
    const visibleNodeIds = new Set(
      [...masterData, ...lifecycleProcesses, ...crossFunctionalProcesses, ...sharedServices]
        .filter(isRecord)
        .map((item) => String(item.id))
    )
    page.lifecycleProcesses = lifecycleProcesses
    page.crossFunctionalProcesses = crossFunctionalProcesses
    page.sharedServices = sharedServices
    page.masterData = masterData
    if (Array.isArray(page.sops)) {
      page.sops = page.sops.filter((sop) => isRecord(sop) && ['lifecycleIds', 'crossFunctionalIds']
        .some((field) => Array.isArray(sop[field]) && sop[field].some((id) => visibleNodeIds.has(String(id)))))
    }
    page.relationships = filterConnections(page.relationships, visibleNodeIds)
  }

  const journey = scoped['lifecycle.journey']
  if (isRecord(journey) && isRecord(journey.stages)) {
    const stages = filterRecord(journey.stages, (stageId) => hasVisibleModule(stageId, allowed))
    const stageOrder = Array.isArray(journey.stageOrder)
      ? journey.stageOrder.filter((stageId) => stageId in stages)
      : []
    journey.stages = stages
    journey.stageOrder = stageOrder
    if (Array.isArray(journey.scenarios)) {
      journey.scenarios = journey.scenarios.map((scenario) => {
        if (!isRecord(scenario)) return scenario
        const highlightStages = Array.isArray(scenario.highlightStages)
          ? scenario.highlightStages.filter((stageId) => String(stageId) in stages)
          : []
        return {
          ...scenario,
          highlightStages,
          primaryEntryStage: highlightStages.includes(scenario.primaryEntryStage)
            ? scenario.primaryEntryStage
            : highlightStages[0]
        }
      }).filter((scenario) => isRecord(scenario) && Array.isArray(scenario.highlightStages) && scenario.highlightStages.length > 0)
    }
  }

  const stepper = scoped['lifecycleStepper.modules']
  if (isRecord(stepper) && isRecord(stepper.stepModuleMap)) {
    const stepModuleMap = filterRecord(stepper.stepModuleMap, (stageId) => hasVisibleModule(stageId, allowed))
    stepper.stepModuleMap = stepModuleMap
    if (Array.isArray(stepper.moduleFilterOptions)) {
      stepper.moduleFilterOptions = stepper.moduleFilterOptions.map((option) => {
        if (!isRecord(option)) return option
        const stepIds = Array.isArray(option.stepIds)
          ? option.stepIds.filter((stepId) => String(stepId) in stepModuleMap)
          : Object.keys(stepModuleMap)
        return { ...option, stepIds }
      }).filter((option) => isRecord(option) && Array.isArray(option.stepIds) && option.stepIds.length > 0)
    }
  }

  const matrix = scoped['matrix.subsystems']
  if (isRecord(matrix)) {
    if (Array.isArray(matrix.subsystems)) {
      matrix.subsystems = matrix.subsystems.filter((item) => isRecord(item) && allowed.has(String(item.id)))
    }
    if (Array.isArray(matrix.flows)) {
      matrix.flows = matrix.flows.filter((flow) => isRecord(flow)
        && allowed.has(String(flow.fromModuleId)) && allowed.has(String(flow.toModuleId)))
    }
  }

  const masterCatalog = scoped['masterData.catalog']
  if (isRecord(masterCatalog)) {
    for (const field of ['catalogItems', 'governanceItems', 'allItems']) {
      if (Array.isArray(masterCatalog[field])) {
        masterCatalog[field] = masterCatalog[field].filter((item) => catalogItemMatchesModules(item, allowed))
      }
    }
    if (Array.isArray(masterCatalog.domainGroups) && Array.isArray(masterCatalog.allItems)) {
      const visibleGroupIds = new Set(masterCatalog.allItems
        .filter(isRecord)
        .map((item) => String(item.domainGroupId)))
      masterCatalog.domainGroups = masterCatalog.domainGroups.filter((group) =>
        isRecord(group) && visibleGroupIds.has(String(group.id))
      )
    }
  }

  const erdClusters = scoped['erd.clusters']
  if (Array.isArray(erdClusters)) {
    scoped['erd.clusters'] = erdClusters.map((cluster) => {
      if (!isRecord(cluster) || !Array.isArray(cluster.items)) return cluster
      return {
        ...cluster,
        items: cluster.items.filter((item) => isRecord(item)
          && modulesForMasterDataId(item.id).some((moduleId) => allowed.has(moduleId)))
      }
    }).filter((cluster) => isRecord(cluster) && Array.isArray(cluster.items) && cluster.items.length > 0)
  }

  const legacy = scoped['legacy.data']
  if (isRecord(legacy) && Array.isArray(legacy.lifecycleMockNodes)) {
    legacy.lifecycleMockNodes = legacy.lifecycleMockNodes.filter((node) =>
      isRecord(node) && hasVisibleModule(String(node.id), allowed)
    )
  }

  return scoped
}
