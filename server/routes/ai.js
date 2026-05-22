const router = require('express').Router();
const controller = require('../controllers/aiController');

router.post('/', controller.aiPlaceholder);

module.exports = router;

