const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const snapshotRoutes = require('./routes/snapshots');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = 8038;

app.use(cors());
app.use(express.json());

require('./database');

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(express.static(path.join(__dirname, '../frontend/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
