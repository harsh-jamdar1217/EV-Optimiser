const router = require('express').Router();
const controller = require('../controllers/evProfile');

router.post('/', controller.createProfile);
router.get('/', controller.getAllProfiles);
router.get('/:id', controller.getProfileById);
router.put('/:id', controller.updateProfile);
router.delete('/:id', controller.deleteProfile);

module.exports = router;


