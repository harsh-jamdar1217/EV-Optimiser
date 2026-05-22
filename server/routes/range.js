const router = require('express').Router();
const controller = require('../controllers/rangeController');

router.post('/', controller.estimateRange);
router.post('/estimate', controller.estimateRange);

module.exports = router;

