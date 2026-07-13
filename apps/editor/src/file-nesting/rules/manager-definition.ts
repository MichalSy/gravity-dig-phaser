import { pairByStem } from '../rule-builders';

export const managerDefinitionRule = pairByStem({
  id: 'manager-definition',
  label: 'Manager Definition',
  priority: 100,
  order: 100,
  primarySuffixes: ['.node.ts', '.node.tsx'],
  childSuffixes: ['.manager.json'],
});
