import { Router } from 'express';
import * as ctrl from '../controllers/rebalanceSnapshotController';

const router = Router();

router.get('/',  ctrl.getRecent);
router.post('/', ctrl.create);

export default router;
