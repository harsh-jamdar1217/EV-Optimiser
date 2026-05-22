const router = require('express').Router();
const controller = require('../controllers/reportController');

router.post('/', controller.reportPlaceholder);

module.exports = router;

