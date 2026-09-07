DELETE FROM AppConfig
WHERE ConfigKey = 'ui.dataset.crossModule.flows'
  AND ScopeType = 'system'
  AND ScopeId = '*';
