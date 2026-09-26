const router = require('express').Router();
const controller = require('../controllers/aiController');

router.post('/', controller.getRecommendations);
router.post('/recommendations', controller.getRecommendations);

module.exports = router;

