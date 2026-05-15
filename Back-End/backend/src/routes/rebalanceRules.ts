import { Router } from 'express';
import * as ctrl from '../controllers/rebalanceRuleController';

const router = Router();

router.get('/', ctrl.get);
router.put('/', ctrl.update);

export default router;
