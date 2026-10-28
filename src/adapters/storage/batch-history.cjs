'use strict';
const { chmodSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { UserError } = require('../../domain/contact.cjs');

class BatchHistory {
  constructor(file, now = Date.now()) {
    const Database = require('better-sqlite3');
    this.db = new Database(file);
    if (file !== ':memory:') chmodSync(file, 0o600);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = DELETE');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL, account TEXT NOT NULL,
      revision TEXT NOT NULL, interval_seconds INTEGER NOT NULL, outcome TEXT NOT NULL,
      status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS batch_attempts (
      id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      mode TEXT NOT NULL, account TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
      manifest TEXT NOT NULL, bundle_hash TEXT NOT NULL, status TEXT NOT NULL,
      started_at INTEGER NOT NULL, finished_at INTEGER, message_id TEXT, error_code TEXT,
      resolution TEXT, reviewed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS batch_recipient ON batch_attempts(mode, account, phone, bundle_hash);
    CREATE TABLE IF NOT EXISTS queue_cooldowns (mode TEXT NOT NULL, account TEXT NOT NULL, ended_at INTEGER NOT NULL, PRIMARY KEY(mode, account));`);
    this.db.transaction(() => {
      const interrupted = this.db
        .prepare(
          "SELECT mode, account FROM batch_attempts WHERE status = 'sending'",
        )
        .all();
      this.db
        .prepare(
          "UPDATE batch_attempts SET status = 'uncertain', finished_at = ?, error_code = 'INTERRUPTED' WHERE status = 'sending'",
        )
        .run(now);
      this.db
        .prepare(
          "UPDATE batch_attempts SET status = 'cancelled', finished_at = ?, error_code = 'INTERRUPTED_BEFORE_SEND' WHERE status = 'preparing'",
        )
        .run(now);
      for (const item of interrupted)
        this.cooldown(item.mode, item.account, now);
      this.db
        .prepare(
          "UPDATE batches SET status = 'interrupted', finished_at = ? WHERE status = 'running'",
        )
        .run(now);
    })();
  }
  cooldown(mode, account, endedAt) {
    this.db
      .prepare(
        'INSERT INTO queue_cooldowns VALUES (?, ?, ?) ON CONFLICT(mode, account) DO UPDATE SET ended_at = MAX(ended_at, excluded.ended_at)',
      )
      .run(mode, account, endedAt);
  }
  lastEnd(mode, account) {
    return (
      this.db
        .prepare(
          'SELECT ended_at FROM queue_cooldowns WHERE mode = ? AND account = ?',
        )
        .get(mode, account)?.ended_at || 0
    );
  }
  latestEnd(mode) {
    return (
      this.db
        .prepare(
          'SELECT MAX(ended_at) AS endedAt FROM queue_cooldowns WHERE mode = ?',
        )
        .get(mode).endedAt || 0
    );
  }
  risks(mode, account, item) {
    const previous = this.db
      .prepare(
        "SELECT status, resolution, manifest, bundle_hash FROM batch_attempts WHERE mode = ? AND account = ? AND phone = ? AND (status IN ('sent', 'sending', 'uncertain'))",
      )
      .all(mode, account, item.phone);
    const blocked = previous.some(
      (row) =>
        row.status === 'sending' ||
        (row.status === 'uncertain' && !row.resolution),
    );
    const effectiveSent = previous.filter(
      (row) =>
        row.status === 'sent' ||
        (row.status === 'uncertain' && row.resolution === 'sent'),
    );
    const exact = effectiveSent.some(
      (row) => row.bundle_hash === item.bundleHash,
    );
    const hashes = new Set(
      effectiveSent
        .filter((row) => row.bundle_hash !== item.bundleHash)
        .flatMap((row) => JSON.parse(row.manifest).map((file) => file.sha256)),
    );
    return {
      blocked,
      exact,
      repeatedFiles: item.files
        .filter((file) => hashes.has(file.sha256))
        .map((file) => file.name),
    };
  }
  beginBatch(review, now) {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO batches VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)')
      .run(
        id,
        review.mode,
        review.account,
        review.revision,
        review.intervalSeconds,
        review.outcome,
        'running',
        now,
      );
    return id;
  }
  beginAttempt(batchId, review, item, now) {
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO batch_attempts(id, batch_id, mode, account, name, phone, manifest, bundle_hash, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        batchId,
        review.mode,
        review.account,
        item.contactName,
        item.phone,
        JSON.stringify(item.files),
        item.bundleHash,
        'preparing',
        now,
      );
    return id;
  }
  markSending(id) {
    this.db
      .prepare(
        "UPDATE batch_attempts SET status = 'sending' WHERE id = ? AND status = 'preparing'",
      )
      .run(id);
  }
  finishAttempt(
    id,
    status,
    now,
    messageId = null,
    code = null,
    dispatched = false,
  ) {
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT mode, account FROM batch_attempts WHERE id = ?')
        .get(id);
      this.db
        .prepare(
          'UPDATE batch_attempts SET status = ?, finished_at = ?, message_id = ?, error_code = ? WHERE id = ?',
        )
        .run(status, now, messageId, code, id);
      if (dispatched) this.cooldown(row.mode, row.account, now);
    })();
  }
  finishBatch(id, status, now) {
    this.db
      .prepare('UPDATE batches SET status = ?, finished_at = ? WHERE id = ?')
      .run(status, now, id);
  }
  page(page) {
    const total = this.db
      .prepare('SELECT COUNT(*) AS total FROM batch_attempts')
      .get().total;
    const rows = this.db
      .prepare(
        'SELECT id, batch_id AS batchId, mode, account, name, phone, manifest, bundle_hash AS bundleHash, status, started_at AS startedAt, finished_at AS finishedAt, message_id AS messageId, error_code AS errorCode, resolution, reviewed_at AS reviewedAt FROM batch_attempts ORDER BY started_at DESC, rowid DESC LIMIT 20 OFFSET ?',
      )
      .all(page * 20)
      .map((row) => ({
        ...row,
        files: JSON.parse(row.manifest),
        manifest: undefined,
      }));
    const batches = this.db
      .prepare(
        'SELECT id, mode, account, interval_seconds AS intervalSeconds, status, started_at AS startedAt, finished_at AS finishedAt FROM batches ORDER BY started_at DESC, rowid DESC LIMIT 5',
      )
      .all();
    return { page, total, rows, batches };
  }
  uncertain(id) {
    return this.db
      .prepare(
        "SELECT id, mode, account, phone FROM batch_attempts WHERE id = ? AND status = 'uncertain' AND resolution IS NULL",
      )
      .get(id);
  }
  sessionResults(mode, account) {
    if (!account) return [];
    const rows = this.db
      .prepare(
        'SELECT id, name, phone, status, resolution FROM batch_attempts WHERE mode = ? AND account = ? ORDER BY started_at DESC, rowid DESC',
      )
      .all(mode, account);
    const latest = new Map();
    for (const row of rows)
      if (!latest.has(row.phone)) latest.set(row.phone, row);
    return [...latest.values()];
  }
  sentAttempts(mode, account) {
    if (!account) return [];
    const rows = this.db
      .prepare(
        "SELECT id, phone FROM batch_attempts WHERE mode = ? AND account = ? AND (status = 'sent' OR (status = 'uncertain' AND resolution = 'sent')) ORDER BY rowid DESC",
      )
      .all(mode, account);
    const latest = new Map();
    for (const row of rows)
      if (!latest.has(row.phone)) latest.set(row.phone, row);
    return [...latest.values()];
  }
  sentPhones(mode, account) {
    return this.sentAttempts(mode, account).map((row) => row.phone);
  }
  resolve(id, resolution, now) {
    if (!this.uncertain(id))
      throw new UserError('El resultado ya no está pendiente de revisión.');
    this.db
      .prepare(
        'UPDATE batch_attempts SET resolution = ?, reviewed_at = ? WHERE id = ?',
      )
      .run(resolution, now, id);
  }
  clear() {
    this.db.exec('DELETE FROM batches');
  }
  close() {
    this.db.close();
  }
}
module.exports = { BatchHistory };
