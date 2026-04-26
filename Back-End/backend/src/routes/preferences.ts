import { Router } from 'express';
import * as ctrl from '../controllers/preferencesController';

const router = Router();

router.get('/', ctrl.getPreferences);
router.put('/', ctrl.updatePreferences);

export default router;
