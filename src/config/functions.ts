import { getFunctions } from "firebase/functions";

import { app } from "@/src/config/firebase";

export const firebaseFunctionsRegion = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || "europe-west1";
export const firebaseFunctions = getFunctions(app, firebaseFunctionsRegion);