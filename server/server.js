require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes (stubs)
app.use('/api/ev-profiles', require('./routes/evProfile'));

app.use('/api/performance', require('./routes/performance'));
app.use('/api/battery', require('./routes/battery'));
app.use('/api/range', require('./routes/range'));
app.use('/api/charging', require('./routes/charging'));
app.use('/api/degradation', require('./routes/degradation'));
app.use('/api/cost', require('./routes/cost'));
app.use('/api/health', require('./routes/health'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/digitalTwin', require('./routes/digitalTwin'));
app.use('/api/report', require('./routes/report'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ev-optimizer-server' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`EV Optimizer server listening on port ${PORT}`);
});

// Trigger restart


