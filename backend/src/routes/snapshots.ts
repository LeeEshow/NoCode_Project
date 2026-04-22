import { Router } from 'express';
import * as ctrl from '../controllers/snapshotsController';

const router = Router();

router.post('/record',  ctrl.record);
router.get('/',         ctrl.getByRange);
router.get('/:date',    ctrl.getByDate);
router.put('/:date',    ctrl.update);

export default router;
