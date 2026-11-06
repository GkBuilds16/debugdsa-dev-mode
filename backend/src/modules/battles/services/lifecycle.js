import Battle from '../../../models/Battle.js';

export function getBattleState(battle, now = new Date()) {
  if (battle.status === 'DRAFT' || battle.status === 'CANCELLED') return battle.status;
  const startsAt = new Date(battle.startsAt), registrationDeadline = new Date(battle.registrationDeadline);
  const endsAt = new Date(+startsAt + battle.durationMinutes * 60_000);
  if (now >= endsAt) return 'COMPLETED';
  if (now >= startsAt) return 'LIVE';
  if (now >= registrationDeadline) return 'REGISTRATION_CLOSED';
  return 'SCHEDULED';
}

export function endsAt(battle) { return new Date(+new Date(battle.startsAt) + battle.durationMinutes * 60_000); }

export async function refreshBattle(battle, now = new Date()) {
  const state = getBattleState(battle, now);
  if (state !== battle.status && state !== 'DRAFT' && state !== 'CANCELLED') {
    const result = await Battle.findOneAndUpdate({ _id: battle._id, status: battle.status }, { $set: { status: state } }, { new: true, runValidators: true });
    if (result) return result;
    return Battle.findById(battle._id);
  }
  return battle;
}

export async function recoverBattleLifecycle(now = new Date()) {
  const due = await Battle.find({ status: { $in: ['SCHEDULED', 'REGISTRATION_CLOSED', 'LIVE', 'SUBMISSION_CLOSED', 'EVALUATING'] } }).select('_id status startsAt registrationDeadline durationMinutes').lean();
  for (const row of due) await Battle.findOneAndUpdate({ _id: row._id, status: row.status }, { $set: { status: getBattleState(row, now) } }, { runValidators: true });
}
