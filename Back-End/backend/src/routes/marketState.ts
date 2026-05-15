import { Router } from 'express';
import * as ctrl from '../controllers/marketStateController';

const router = Router();

router.get('/', ctrl.get);
router.put('/', ctrl.update);

export default router;
