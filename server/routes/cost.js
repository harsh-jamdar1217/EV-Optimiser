const router = require('express').Router();
const controller = require('../controllers/costController');

router.post('/', controller.getCostComparison);
router.post('/compare', controller.getCostComparison);

module.exports = router;

