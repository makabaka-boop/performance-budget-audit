const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const checkBudgetViolations = (snapshotId, chunks, budgetConfig) => {
  const violations = [];
  
  const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
  const totalGzipSize = chunks.reduce((sum, c) => sum + c.gzip_size, 0);
  
  if (totalSize > budgetConfig.max_total_size) {
    violations.push({
      snapshotId,
      violation_type: 'total_size',
      message: `Total size exceeds budget`,
      threshold: budgetConfig.max_total_size,
      actual_value: totalSize
    });
  }
  
  if (totalGzipSize > budgetConfig.max_gzip_size) {
    violations.push({
      snapshotId,
      violation_type: 'total_gzip_size',
      message: `Total gzip size exceeds budget`,
      threshold: budgetConfig.max_gzip_size,
      actual_value: totalGzipSize
    });
  }
  
  chunks.forEach(chunk => {
    if (chunk.gzip_size > budgetConfig.max_chunk_size) {
      violations.push({
        snapshotId,
        chunk_id: chunk.id,
        violation_type: 'chunk_size',
        message: `Chunk ${chunk.name} exceeds size limit`,
        threshold: budgetConfig.max_chunk_size,
        actual_value: chunk.gzip_size
      });
    }
  });
  
  return violations;
};

router.post('/', (req, res) => {
  const { project_id, branch, version, commit_hash, notes, chunks, build_time } = req.body;
  
  const safeChunks = Array.isArray(chunks) ? chunks : [];
  const totalSize = safeChunks.reduce((sum, c) => sum + (c.size || 0), 0);
  const totalGzipSize = safeChunks.reduce((sum, c) => sum + (c.gzip_size || 0), 0);
  
  const defaultConfig = { max_total_size: 5242880, max_chunk_size: 1048576, max_gzip_size: 524288 };
  
  db.get('SELECT * FROM budget_configs WHERE project_id = ?', [project_id], (err, budgetConfig) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = budgetConfig || defaultConfig;
    
    const insertSnapshot = (snapshotId) => {
      if (safeChunks.length === 0) {
        const violations = checkBudgetViolations(snapshotId, [], config);
        const gateStatus = violations.length > 0 ? 'failed' : 'passed';
        
        db.run(
          'UPDATE build_snapshots SET gate_status = ? WHERE id = ?',
          [gateStatus, snapshotId],
          () => {
            res.json({ id: snapshotId, gate_status: gateStatus, violations: [] });
          }
        );
        return;
      }
      
      const chunkIds = [];
      let completed = 0;
      
      safeChunks.forEach((chunk) => {
        db.run(
          `INSERT INTO chunks (snapshot_id, name, size, gzip_size, chunk_type, dependency_source)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [snapshotId, chunk.name, chunk.size || 0, chunk.gzip_size || 0, chunk.chunk_type || '', chunk.dependency_source || ''],
          function(err) {
            if (err) {
              completed++;
              if (completed === safeChunks.length) {
                const violations = checkBudgetViolations(snapshotId, chunkIds, config);
                const gateStatus = violations.length > 0 ? 'failed' : 'passed';
                
                db.run(
                  'UPDATE build_snapshots SET gate_status = ? WHERE id = ?',
                  [gateStatus, snapshotId],
                  () => {
                    violations.forEach(v => {
                      db.run(
                        `INSERT INTO budget_violations (snapshot_id, chunk_id, violation_type, message, threshold, actual_value)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [snapshotId, v.chunk_id || null, v.violation_type, v.message, v.threshold, v.actual_value]
                      );
                    });
                    
                    res.json({ id: snapshotId, gate_status: gateStatus, violations });
                  }
                );
              }
              return;
            }
            
            chunkIds.push({ ...chunk, id: this.lastID });
            completed++;
            
            if (completed === safeChunks.length) {
              const violations = checkBudgetViolations(snapshotId, chunkIds, config);
              const gateStatus = violations.length > 0 ? 'failed' : 'passed';
              
              db.run(
                'UPDATE build_snapshots SET gate_status = ? WHERE id = ?',
                [gateStatus, snapshotId],
                () => {
                  violations.forEach(v => {
                    db.run(
                      `INSERT INTO budget_violations (snapshot_id, chunk_id, violation_type, message, threshold, actual_value)
                       VALUES (?, ?, ?, ?, ?, ?)`,
                      [snapshotId, v.chunk_id || null, v.violation_type, v.message, v.threshold, v.actual_value]
                    );
                  });
                  
                  res.json({ id: snapshotId, gate_status: gateStatus, violations });
                }
              );
            }
          }
        );
      });
    };
    
    if (build_time) {
      db.run(
        `INSERT INTO build_snapshots (project_id, branch, version, commit_hash, notes, build_time, total_size, total_gzip_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [project_id, branch || 'main', version, commit_hash, notes, build_time, totalSize, totalGzipSize],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          insertSnapshot(this.lastID);
        }
      );
    } else {
      db.run(
        `INSERT INTO build_snapshots (project_id, branch, version, commit_hash, notes, total_size, total_gzip_size)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [project_id, branch || 'main', version, commit_hash, notes, totalSize, totalGzipSize],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          insertSnapshot(this.lastID);
        }
      );
    }
  });
});

router.get('/project/:projectId', (req, res) => {
  const { branch, version, limit = 20 } = req.query;
  let query = 'SELECT * FROM build_snapshots WHERE project_id = ?';
  const params = [req.params.projectId];
  
  if (branch) {
    query += ' AND branch = ?';
    params.push(branch);
  }
  
  if (version) {
    query += ' AND version = ?';
    params.push(version);
  }
  
  query += ' ORDER BY build_time DESC LIMIT ?';
  params.push(parseInt(limit));
  
  db.all(query, params, (err, snapshots) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(snapshots);
  });
});

router.get('/:id', (req, res) => {
  db.get(
    'SELECT * FROM build_snapshots WHERE id = ?',
    [req.params.id],
    (err, snapshot) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
      
      db.all(
        'SELECT * FROM chunks WHERE snapshot_id = ?',
        [req.params.id],
        (err, chunks) => {
          if (err) return res.status(500).json({ error: err.message });
          
          db.all(
            'SELECT * FROM budget_violations WHERE snapshot_id = ?',
            [req.params.id],
            (err, violations) => {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ ...snapshot, chunks, violations });
            }
          );
        }
      );
    }
  );
});

router.get('/:id/compare/:compareId', (req, res) => {
  const getSnapshotData = (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM build_snapshots WHERE id = ?', [id], (err, snapshot) => {
        if (err) reject(err);
        db.all('SELECT * FROM chunks WHERE snapshot_id = ?', [id], (err, chunks) => {
          if (err) reject(err);
          resolve({ ...snapshot, chunks });
        });
      });
    });
  };
  
  Promise.all([getSnapshotData(req.params.id), getSnapshotData(req.params.compareId)])
    .then(([snapshot1, snapshot2]) => {
      const chunkMap1 = new Map(snapshot1.chunks.map(c => [c.name, c]));
      const chunkMap2 = new Map(snapshot2.chunks.map(c => [c.name, c]));
      
      const allChunkNames = new Set([...chunkMap1.keys(), ...chunkMap2.keys()]);
      const changes = [];
      
      allChunkNames.forEach(name => {
        const c1 = chunkMap1.get(name);
        const c2 = chunkMap2.get(name);
        
        if (c1 && c2) {
          changes.push({
            name,
            status: 'modified',
            old_size: c2.size,
            new_size: c1.size,
            size_diff: c1.size - c2.size,
            old_gzip_size: c2.gzip_size,
            new_gzip_size: c1.gzip_size,
            gzip_diff: c1.gzip_size - c2.gzip_size
          });
        } else if (c1) {
          changes.push({
            name,
            status: 'added',
            new_size: c1.size,
            new_gzip_size: c1.gzip_size
          });
        } else {
          changes.push({
            name,
            status: 'removed',
            old_size: c2.size,
            old_gzip_size: c2.gzip_size
          });
        }
      });
      
      res.json({
        snapshot1,
        snapshot2,
        changes,
        total_diff: snapshot1.total_size - snapshot2.total_size,
        total_gzip_diff: snapshot1.total_gzip_size - snapshot2.total_gzip_size
      });
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

router.put('/:id/notes', (req, res) => {
  db.run(
    'UPDATE build_snapshots SET notes = ? WHERE id = ?',
    [req.body.notes, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
