const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  db.all(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC',
    [req.userId],
    (err, projects) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(projects);
    }
  );
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  
  db.run(
    'INSERT INTO projects (user_id, name, description) VALUES (?, ?, ?)',
    [req.userId, name, description],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const projectId = this.lastID;
      db.run(
        'INSERT INTO budget_configs (project_id) VALUES (?)',
        [projectId],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: projectId, name, description, user_id: req.userId });
        }
      );
    }
  );
});

router.get('/:id', (req, res) => {
  db.get(
    'SELECT * FROM projects WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
    (err, project) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
    }
  );
});

router.get('/:id/budget', (req, res) => {
  db.get(
    'SELECT * FROM budget_configs WHERE project_id = ?',
    [req.params.id],
    (err, config) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(config || {});
    }
  );
});

router.put('/:id/budget', (req, res) => {
  const { max_total_size, max_chunk_size, max_gzip_size } = req.body;
  
  db.run(
    `UPDATE budget_configs SET max_total_size = ?, max_chunk_size = ?, max_gzip_size = ? 
     WHERE project_id = ?`,
    [max_total_size, max_chunk_size, max_gzip_size, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
