const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS budget_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    max_total_size INTEGER DEFAULT 5242880,
    max_chunk_size INTEGER DEFAULT 1048576,
    max_gzip_size INTEGER DEFAULT 524288,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS build_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    branch TEXT DEFAULT 'main',
    version TEXT NOT NULL,
    build_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    commit_hash TEXT,
    notes TEXT,
    gate_status TEXT DEFAULT 'pending',
    total_size INTEGER NOT NULL,
    total_gzip_size INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    gzip_size INTEGER NOT NULL,
    chunk_type TEXT,
    dependency_source TEXT,
    FOREIGN KEY (snapshot_id) REFERENCES build_snapshots(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS budget_violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    chunk_id INTEGER,
    violation_type TEXT NOT NULL,
    message TEXT NOT NULL,
    threshold INTEGER,
    actual_value INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (snapshot_id) REFERENCES build_snapshots(id),
    FOREIGN KEY (chunk_id) REFERENCES chunks(id)
  )`);
});

module.exports = db;
