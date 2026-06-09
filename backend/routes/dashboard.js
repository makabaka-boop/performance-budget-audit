const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/stats', (req, res) => {
  db.all(
    `SELECT bs.*, p.name as project_name 
     FROM build_snapshots bs 
     JOIN projects p ON bs.project_id = p.id 
     WHERE p.user_id = ? 
     ORDER BY bs.build_time DESC LIMIT 100`,
    [req.userId],
    (err, snapshots) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const failedCount = snapshots.filter(s => s.gate_status === 'failed').length;
      
      db.all(
        `SELECT bv.*, bs.project_id, p.name as project_name 
         FROM budget_violations bv
         JOIN build_snapshots bs ON bv.snapshot_id = bs.id
         JOIN projects p ON bs.project_id = p.id
         WHERE p.user_id = ?
         ORDER BY bv.created_at DESC LIMIT 50`,
        [req.userId],
        (err, violations) => {
          if (err) return res.status(500).json({ error: err.message });
          
          const recentFailed = snapshots
            .filter(s => s.gate_status === 'failed')
            .slice(0, 5);
          
          res.json({
            total_snapshots: snapshots.length,
            failed_count: failedCount,
            violation_count: violations.length,
            recent_failed: recentFailed,
            size_trend: snapshots.slice(0, 20).reverse().map(s => ({
              date: s.build_time,
              version: s.version,
              size: s.total_size,
              gzip_size: s.total_gzip_size,
              project: s.project_name
            }))
          });
        }
      );
    }
  );
});

router.get('/max-growth', (req, res) => {
  const { project_id } = req.query;
  
  let query = `
    SELECT 
      c1.name,
      c1.gzip_size as current_size,
      c2.gzip_size as prev_size,
      (c1.gzip_size - c2.gzip_size) as growth,
      bs1.version,
      p.name as project_name
    FROM chunks c1
    JOIN build_snapshots bs1 ON c1.snapshot_id = bs1.id
    JOIN projects p ON bs1.project_id = p.id
    JOIN build_snapshots bs2 ON bs2.id = (
      SELECT id FROM build_snapshots 
      WHERE project_id = bs1.project_id AND id < bs1.id
      ORDER BY id DESC LIMIT 1
    )
    JOIN chunks c2 ON c2.snapshot_id = bs2.id AND c2.name = c1.name
    WHERE p.user_id = ?
  `;
  
  const params = [req.userId];
  
  if (project_id) {
    query += ' AND bs1.project_id = ?';
    params.push(project_id);
  }
  
  query += ' ORDER BY growth DESC LIMIT 10';
  
  db.all(query, params, (err, growths) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(growths);
  });
});

module.exports = router;
