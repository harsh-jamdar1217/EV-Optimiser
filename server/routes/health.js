const router = require('express').Router();
const controller = require('../controllers/healthController');

router.post('/', controller.assessHealth);
router.post('/assess', controller.assessHealth);
router.get('/history/:profile_id', controller.getHealthHistory);

module.exports = router;
