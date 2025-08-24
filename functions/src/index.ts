import * as admin from 'firebase-admin';
import { onValueWritten } from 'firebase-functions/v2/database';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2/options';

try {
  admin.app();
} catch {
  admin.initializeApp();
}

setGlobalOptions({ region: 'asia-southeast1', timeoutSeconds: 60, memory: '256MiB' });
const db = admin.database();

// RTDB onWrite trigger for immutable score logs
export const onScoreWrite = onValueWritten({ ref: '/scores/{playerId}/{courseId}/{hole}', region: 'asia-southeast1' }, async (event) => {
  const before = event.data.before.val();
  const after = event.data.after.val();
  if (before === after) return;

  const { playerId, courseId, hole } = event.params as any;
  const now = new Date();
  const bucketKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`; // yyyyMMddHH

  const logRef = db.ref(`/scoreImmutableLogs/${bucketKey}`).push();

  const byUid = 'unknown';
  const byRole = 'unknown';

  await logRef.set({
    path: `scores/${playerId}/${courseId}/${hole}`,
    playerId,
    courseId,
    hole: Number(hole),
    oldValue: before ?? null,
    newValue: after ?? null,
    changedAt: Date.now(),
    byUid,
    byRole
  });

  // 실시간 미러링: 동일 값을 /scores_mirror에 동기 기록
  await db.ref(`/scores_mirror/${playerId}/${courseId}/${hole}`).set(after ?? null);
  await db.ref(`/scores_mirror_meta/lastWriteAt`).set(Date.now());
});

// 즉시 복구: 미러(/scores_mirror)에서 본선(/scores)으로 전체 복사
export const restoreFromMirror = onCall({ region: 'asia-southeast1', timeoutSeconds: 300, memory: '512MiB' }, async () => {
  const snap = await db.ref('/scores_mirror').get();
  if (!snap.exists()) throw new Error('미러 데이터가 없습니다.');
  const data = snap.val();
  await db.ref('/scores').set(data);
  return { restored: true, size: JSON.stringify(data).length };
});

// 미러 TTL 정리: 48시간 동안 쓰기 없으면 /scores_mirror 자동 삭제
export const cleanMirrorTTL = onSchedule({ region: 'asia-southeast1', schedule: 'every 6 hours' }, async () => {
  const lastSnap = await db.ref('/scores_mirror_meta/lastWriteAt').get();
  const last = Number(lastSnap.val() || 0);
  if (!last) return;
  const elapsed = Date.now() - last;
  const THRESHOLD = 48 * 3600 * 1000; // 48h
  if (elapsed > THRESHOLD) {
    await db.ref('/scores_mirror').remove();
  }
});

// 미러 자동 준비: 비어있거나 오래되면 /scores 전체를 /scores_mirror로 복제
export const initMirrorIfNeeded = onCall({ region: 'asia-southeast1', timeoutSeconds: 300, memory: '512MiB' }, async () => {
  const mirrorSnap = await db.ref('/scores_mirror').get();
  const lastSnap = await db.ref('/scores_mirror_meta/lastWriteAt').get();
  const last = Number(lastSnap.val() || 0);
  const tooOld = last && (Date.now() - last > 48 * 3600 * 1000);
  if (mirrorSnap.exists() && !tooOld) {
    return { initialized: false, reason: 'exists' };
  }
  const src = await db.ref('/scores').get();
  const data = src.exists() ? src.val() : {};
  await db.ref('/scores_mirror').set(data);
  await db.ref('/scores_mirror_meta/lastWriteAt').set(Date.now());
  return { initialized: true, size: JSON.stringify(data).length };
});


