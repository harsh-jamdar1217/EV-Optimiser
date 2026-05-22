const router = require('express').Router();
const controller = require('../controllers/digitalTwinController');

router.post('/', controller.digitalTwinPlaceholder);

module.exports = router;

