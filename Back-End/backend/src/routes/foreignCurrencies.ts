import { Router } from 'express';
import * as ctrl from '../controllers/foreignCurrenciesController';

const router = Router();

router.get('/',      ctrl.getAll);
router.put('/:code', ctrl.upsert);
router.delete('/:code', ctrl.remove);

export default router;
