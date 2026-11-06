import { normalizeProjectPath } from '../services/filePolicy.js';

const textFields = {
  title: 100, description: 300, detailedDescription: 20000, problemStatement: 10000,
  category: 60, sourceUrl: 500, readme: 20000, instructions: 10000,
  environmentDocumentation: 10000, configurationInstructions: 10000,
  bugTitle: 150, bugDescription: 10000, currentBehavior: 5000, expectedBehavior: 5000,
  actualBehavior: 5000, errorLogs: 10000, privateNotes: 10000,
  intendedBugExplanation: 10000, solutionApproach: 10000
};
const arrayFields = {
  languages: [30, 20], technologies: [40, 30], frameworks: [40, 30], tags: [30, 40],
  requiredTools: [100, 30], dependencies: [200, 100], prerequisites: [300, 30],
  expectedStructure: [300, 300], reproductionSteps: [1000, 30], relevantFiles: [300, 100],
  relevantSymbols: [200, 100], acceptanceCriteria: [1000, 30], expectedDeliverables: [500, 30],
  publicHints: [500, 20], hiddenRequirements: [1000, 100], internalReferences: [500, 100]
};
const allowed = new Set([...Object.keys(textFields), ...Object.keys(arrayFields), 'difficulty', 'estimatedMinutes', 'databaseTechnology', 'runtimeVersions', 'commands', 'evaluationRubric', 'hiddenTests', 'files', 'directories']);

export function validateCodebaseInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Request body must be an object.');
  const unknown = Object.keys(input).filter(key => !allowed.has(key) && key !== 'version');
  if (unknown.length) throw new Error(`Unsupported fields: ${unknown.slice(0, 5).join(', ')}`);
  if (!partial && (!String(input.title || '').trim() || !String(input.description || '').trim())) throw new Error('Project title and short description are required.');
  const output = {};
  for (const [field, maxLength] of Object.entries(textFields)) {
    if (!Object.hasOwn(input, field)) continue;
    if (typeof input[field] !== 'string' || input[field].length > maxLength) throw new Error(`${field} must be text no longer than ${maxLength} characters.`);
    output[field] = input[field];
  }
  for (const [field, [maxLength, maxCount]] of Object.entries(arrayFields)) {
    if (!Object.hasOwn(input, field)) continue;
    if (!Array.isArray(input[field]) || input[field].length > maxCount || input[field].some(item => typeof item !== 'string' || item.length > maxLength)) throw new Error(`${field} must contain at most ${maxCount} text entries of ${maxLength} characters.`);
    output[field] = input[field];
  }
  if (Object.hasOwn(input, 'difficulty')) {
    if (!['Easy', 'Medium', 'Hard'].includes(input.difficulty)) throw new Error('difficulty must be Easy, Medium, or Hard.');
    output.difficulty = input.difficulty;
  }
  if (Object.hasOwn(input, 'estimatedMinutes')) {
    const value = Number(input.estimatedMinutes);
    if (!Number.isInteger(value) || value < 5 || value > 1000) throw new Error('estimatedMinutes must be an integer between 5 and 1000.');
    output.estimatedMinutes = value;
  }
  if (Object.hasOwn(input, 'databaseTechnology')) {
    if (typeof input.databaseTechnology !== 'string' || input.databaseTechnology.length > 100) throw new Error('databaseTechnology must be at most 100 characters.');
    output.databaseTechnology = input.databaseTechnology;
  }
  for (const field of ['runtimeVersions', 'commands']) if (Object.hasOwn(input, field)) {
    if (!input[field] || typeof input[field] !== 'object' || Array.isArray(input[field])) throw new Error(`${field} must be an object.`);
    if (field === 'commands' && Object.keys(input[field]).some(key => !['build', 'start', 'test'].includes(key))) throw new Error('commands supports build, start, and test only.');
    if (field === 'commands' && Object.values(input[field]).some(value => typeof value !== 'string' || value.length > 500)) throw new Error('Build, start, and test commands must be text of at most 500 characters.');
    if (field === 'runtimeVersions' && (Object.keys(input[field]).length > 20 || Object.entries(input[field]).some(([key, value]) => key.length > 40 || typeof value !== 'string' || value.length > 100))) throw new Error('runtimeVersions supports up to 20 short string values.');
    output[field] = input[field];
  }
  for (const field of ['evaluationRubric', 'hiddenTests']) if (Object.hasOwn(input, field)) {
    if (!Array.isArray(input[field]) || input[field].length > 100 || Buffer.byteLength(JSON.stringify(input[field]), 'utf8') > 256 * 1024) throw new Error(`${field} must be an array of at most 100 entries and 256 KiB.`);
    output[field] = input[field];
  }
  if (Object.hasOwn(input, 'directories')) {
    if (!Array.isArray(input.directories) || input.directories.length > 300 || input.directories.some(dir => typeof dir !== 'string')) throw new Error('directories must be a list of relative paths.');
    const normalized = input.directories.map(dir => normalizeProjectPath(dir, { directory: true }));
    if (new Set(normalized.map(dir => dir.toLowerCase())).size !== normalized.length) throw new Error('directories must not contain duplicate paths.');
    output.directories = normalized;
  }
  if (Object.hasOwn(input, 'files')) {
    if (!Array.isArray(input.files)) throw new Error('files must be an array.');
    output.files = input.files;
  }
  return output;
}

