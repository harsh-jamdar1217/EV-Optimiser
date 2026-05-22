const router = require('express').Router();
const controller = require('../controllers/performanceController');

router.post('/analyze', controller.analyzePerformance);
router.get('/history/:profile_id', controller.getPerformanceHistory);

module.exports = router;

