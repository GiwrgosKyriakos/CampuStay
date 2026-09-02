import { getFunctions } from "firebase/functions";

import { app } from "@/src/config/firebase";

export const firebaseFunctions = getFunctions(app);