const router = require('express').Router();
const controller = require('../controllers/digitalTwinController');

router.post('/', controller.simulateScenarios);
router.post('/simulate', controller.simulateScenarios);

module.exports = router;