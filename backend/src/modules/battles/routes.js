import express from 'express';
import Battle from '../../models/Battle.js';
import Registration from '../../models/Registration.js';
import BattleSubmission from '../../models/BattleSubmission.js';
import { identity, requireCreator } from '../../identity.js';
import * as controller from './controllers/battleController.js';
import { refreshBattle } from './services/lifecycle.js';
import { serializeBattle, serializeRegistration } from './serializers/battleSerializer.js';
import { isEligible } from './services/battleService.js';

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
router.use(identity);
router.param('id', (req, res, next, id) => controller.validId(id) ? next() : controller.fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.'));
router.param('workspaceId', (req, res, next, id) => controller.validId(id) ? next() : controller.fail(res, 400, 'INVALID_ID', 'Workspace ID is invalid.'));
router.param('submissionId', (req, res, next, id) => controller.validId(id) ? next() : controller.fail(res, 400, 'INVALID_ID', 'Submission ID is invalid.'));
router.get('/', wrap(controller.discoverBattles));
router.get('/history', wrap(controller.ownHistory));
router.get('/mine', requireCreator, wrap(controller.listOwned));
router.post('/', requireCreator, wrap(controller.create));
router.get('/manage/:id', requireCreator, wrap(controller.detail));
router.patch('/manage/:id', requireCreator, wrap(controller.update));
router.post('/manage/:id/publish', requireCreator, wrap(controller.publish));
router.post('/manage/:id/cancel', requireCreator, wrap(controller.cancel));
router.get('/manage/:id/participants', requireCreator, wrap(controller.participants));
router.get('/manage/:id/submissions', requireCreator, wrap(controller.organizerSubmissions));
router.get('/manage/:id/submissions/:submissionId', requireCreator, wrap(controller.organizerSubmission));
router.post('/manage/:id/results/publish', requireCreator, wrap(controller.publishResults));
router.get('/submissions/:submissionId', wrap(controller.ownSubmission));
router.get('/:id', wrap(controller.detail));
router.get('/:id/lobby', wrap(controller.lobby));
router.get('/:id/registration', wrap(async (req, res) => {
  if (!controller.validId(req.params.id)) return controller.fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const row = await Registration.findOne({ battleId: req.params.id, userId: req.user.id });
  res.json({ success: true, data: row ? serializeRegistration(row) : null });
}));
router.post('/:id/register', wrap(controller.register));
router.delete('/:id/register', wrap(controller.unregister));
router.get('/:id/workspace', wrap(controller.workspace));
router.post('/:id/workspace', wrap(controller.workspace));
router.patch('/:id/workspace/:workspaceId', wrap(controller.saveWorkspace));
router.post('/:id/submit', wrap(controller.submit));
router.get('/:id/results', wrap(controller.results));
router.get('/:id/leaderboard', wrap(async (req, res) => {
  const battle = await Battle.findById(req.params.id).select('+eligibleUserIds');
  if (!battle || ['DRAFT', 'CANCELLED'].includes(battle.status) || !battle.codebaseVersionId || !isEligible(battle, req.user.id)) return controller.fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const state = await refreshBattle(battle);
  res.json({ success: true, data: { status: state.status, evaluation: 'DISABLED', rankings: null, note: 'No ranking is available without verified evaluation results.' } });
}));
router.get('/manage/:id/summary', requireCreator, wrap(async (req, res) => {
  if (!controller.validId(req.params.id)) return controller.fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return controller.fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const registrations = await Registration.countDocuments({ battleId: battle._id, status: 'REGISTERED' });
  const submissions = await BattleSubmission.countDocuments({ battleId: battle._id });
  res.json({ success: true, data: { battle: serializeBattle(battle, { organizer: true }), registrations, submissions } });
}));

router.use((err, _req, res, _next) => {
  if (err.code === 'BATTLE_VALIDATION') return controller.fail(res, 422, err.code, err.message);
  if (err.code === 'BATTLE_CONFLICT' || err.code === 'WORKSPACE_CONFLICT') return controller.fail(res, 409, err.code, err.message);
  if (err.code === 'WORKSPACE_TOO_LARGE') return controller.fail(res, 413, err.code, err.message);
  if (err.name === 'ValidationError') return controller.fail(res, 422, 'VALIDATION_ERROR', 'Battle values are invalid.');
  if (err.name === 'CastError') return controller.fail(res, 400, 'INVALID_ID', 'A supplied identifier is invalid.');
  if (err.code === 11000) return controller.fail(res, 409, 'DUPLICATE_RECORD', 'This battle record already exists.');
  console.error(JSON.stringify({ level: 'error', module: 'battles', name: err.name || 'Error' }));
  return controller.fail(res, 500, 'INTERNAL_ERROR', 'An internal error occurred.');
});

export default router;
