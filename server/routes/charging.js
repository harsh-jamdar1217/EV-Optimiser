const router = require('express').Router();
const controller = require('../controllers/chargingController');

router.post('/', controller.getChargingAdvice);
router.post('/optimize', controller.getChargingAdvice);

module.exports = router;

