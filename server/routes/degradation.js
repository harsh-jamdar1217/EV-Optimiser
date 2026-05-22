const router = require('express').Router();
const controller = require('../controllers/degradationController');

router.post('/', controller.getDegradationForecast);
router.post('/forecast', controller.getDegradationForecast);

module.exports = router;

