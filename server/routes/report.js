const router = require('express').Router();
const controller = require('../controllers/reportController');

router.post('/', controller.generateReportData);
router.post('/generate', controller.generateReportData);

module.exports = router;