const router = require('express').Router();
const { getBatteryAdvice } = require('../controllers/battery');

router.post('/advice', getBatteryAdvice);

module.exports = router;
