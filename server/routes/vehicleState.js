const router = require('express').Router();
const controller = require('../controllers/vehicleStateController');

router.get('/:profile_id', controller.getVehicleState);
router.put('/:profile_id', controller.updateVehicleState);
router.delete('/:profile_id', controller.resetVehicleState);

module.exports = router;
